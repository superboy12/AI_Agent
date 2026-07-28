import { GoogleGenAI } from '@google/genai';
import { config } from '../../config/env';
import { ExcelParser } from '../../parser/excelParser';
import { DocxParser } from '../../parser/docxParser';
import { TemplateMetadataRepository, TemplateAnalysis } from '../../repositories/TemplateMetadataRepository';
import { TemplateAnalyzerService } from './TemplateAnalyzerService';
import { SemanticFieldMatcher, MappingResult } from './SemanticFieldMatcher';
import { PlaceholderDetectorService } from './PlaceholderDetectorService';
import { FieldDictionary } from './FieldDictionary';
import fs from 'fs';
import path from 'path';

export interface SmartFillResult {
    /** The final data object ready to pass to DocumentEngine.fillTemplate() */
    data: Record<string, any>;
    /** Mapping report string for display to user */
    mappingReport: string;
    /** True if any mapping has confidence < 70% */
    hasLowConfidence: boolean;
    /** The full mapping result for further inspection */
    mappingResult: MappingResult;
    /** True if template had legacy placeholders and we reverted to raw legacy processing */
    usedLegacyMode: boolean;
    /** Template analysis (used by DocumentEngine for XML injection) */
    analysis?: TemplateAnalysis;
}

/**
 * SmartMappingService
 *
 * Coordinates the entire AI-powered template filling pipeline:
 *  1. Load template analysis (from TemplateMetadataRepository)
 *  2. Parse Excel file to extract column headers + data rows
 *  3. Run SemanticFieldMatcher to map Excel columns → template fields
 *  4. Build the final `data` object for DocumentEngine.fillTemplate()
 *  5. Apply Fallback (Feature 6): fill "-" for unmapped fields
 *
 * BACKWARD COMPATIBLE:
 *  - If template has legacy {{placeholders}}, this service detects that and
 *    returns usedLegacyMode=true so callers know to use the old Gemini flow.
 *  - This service is NEVER used as a replacement — callers decide which path to take.
 */
export class SmartMappingService {
    private excelParser: ExcelParser;
    private docxParser: DocxParser;
    private analyzerService: TemplateAnalyzerService;
    private matcher: SemanticFieldMatcher;
    private metadataRepo: TemplateMetadataRepository;
    private detector: PlaceholderDetectorService;

    private static readonly FALLBACK_VALUE = '-';

    constructor(workspaceId?: string) {
        this.excelParser = new ExcelParser();
        this.docxParser = new DocxParser();
        this.analyzerService = new TemplateAnalyzerService(workspaceId);
        this.matcher = new SemanticFieldMatcher(workspaceId);
        this.metadataRepo = new TemplateMetadataRepository(workspaceId);
        this.detector = new PlaceholderDetectorService();
    }

    public async init(): Promise<void> {
        await this.analyzerService.init();
        // Initialize matcher to load learned aliases into FieldDictionary
        await this.matcher.init();
    }

    /**
     * Main method: given a template file + Excel file, build the data object
     * for DocumentEngine.fillTemplate().
     *
     * @param templateId Template ID (for loading stored analysis)
     * @param templateFilePath Absolute path to the DOCX template
     * @param excelFilePath Absolute path to the Excel file
     * @param fallbackValue Value to use when no data found (default: "-")
     */
    public async buildFillData(
        templateId: string,
        templateFilePath: string,
        excelFilePath: string | null,
        fallbackValue: string = SmartMappingService.FALLBACK_VALUE,
        memoryData?: string,
        userInstruction?: string
    ): Promise<SmartFillResult> {

        // ── Step 1: Load or generate template analysis ─────────────────────
        let analysis: TemplateAnalysis | null | undefined = await this.metadataRepo.getByTemplateId(templateId);
        if (!analysis) {
            console.log(`[SmartMapping] No cached analysis for ${templateId}, running now...`);
            analysis = await this.analyzerService.analyze(templateId, templateFilePath);
        }

        // ── Step 2: Legacy check — if template has {{placeholders}}, return early ─
        if (analysis?.hasLegacyPlaceholders) {
            console.log(`[SmartMapping] Template ${templateId} uses legacy placeholders. Returning legacy mode.`);
            return this.buildLegacyModeResult(analysis);
        }

        // ── Step 3: If no analysis (e.g., non-DOCX), fall back ─────────────
        if (!analysis || analysis.fields.length === 0) {
            console.log(`[SmartMapping] No fields detected for ${templateId}. Falling back to raw text.`);
            return this.buildLegacyModeResult(analysis || null);
        }

        // ── Step 4: Parse Excel to get column headers and first data row ───
        let excelData = null;
        if (excelFilePath) {
            excelData = await this.parseExcelForMapping(excelFilePath);
            if (!excelData) {
                console.warn('[SmartMapping] Failed to parse Excel, falling back to Memory/AI only.');
            }
        }

        // ── Step 5: Run semantic matching ───────────────────────────────────
        let mappingResult: MappingResult = {
            mappings: [],
            unmappedExcelColumns: [],
            unmappedTemplateFields: analysis.fields.map(f => f.key),
            lowConfidenceFields: []
        };
        
        if (excelData) {
            console.log(`[SmartMapping] Excel headers: ${excelData.headers.join(', ')}`);
            console.log(`[SmartMapping] Template fields: ${analysis.fields.map(f => f.key).join(', ')}`);
            mappingResult = await this.matcher.match(excelData.headers, analysis.fields);
        }

        // ── Step 6: Build data object from mapping + Excel data row ─────────
        const data: Record<string, any> = {};

        // Fill mapped fields — apply type validation + date auto-format
        const dict = FieldDictionary.getInstance();
        if (excelData) {
            for (const mapping of mappingResult.mappings) {
                const value = excelData.row[mapping.excelColumn];
                const templateField = analysis.fields.find(f => f.key === mapping.templateField);

                const fillKey = templateField ? this.getDocxFillKey(templateField, analysis) : mapping.templateField;
                const rawFormatted = this.formatValue(value, fallbackValue);

                const canonical = dict.resolve(mapping.templateLabel) ?? dict.resolve(mapping.templateField) ?? mapping.templateField;
                data[fillKey] = dict.formatValue(rawFormatted, canonical);
            }
        }

        // ── AI/Memory Fallback for unmapped fields ──────────────────────────
        let aiFallbackData: Record<string, string> = {};
        if (mappingResult.unmappedTemplateFields.length > 0 && (memoryData || userInstruction)) {
            console.log(`[SmartMapping] Fetching AI fallback for unmapped fields:`, mappingResult.unmappedTemplateFields);
            aiFallbackData = await this.generateAiFallback(mappingResult.unmappedTemplateFields, userInstruction, memoryData);
        }

        // Apply fallback for unmapped template fields
        for (const unmappedKey of mappingResult.unmappedTemplateFields) {
            const field = analysis.fields.find(f => f.key === unmappedKey);
            const canonical = dict.resolve(field?.label || '') ?? dict.resolve(unmappedKey) ?? unmappedKey;
            
            // Try to find the value in AI fallback data
            let aiValue = aiFallbackData[unmappedKey] || aiFallbackData[canonical] || aiFallbackData[field?.label || ''];
            
            // Type validate and format the fallback value
            let finalValue = dict.formatValue(aiValue || fallbackValue, canonical);
            // If AI returned empty string, use fallbackValue
            if (!finalValue || finalValue.trim() === '') finalValue = fallbackValue;

            if (field) {
                const fillKey = this.getDocxFillKey(field, analysis);
                data[fillKey] = finalValue;
            } else {
                data[unmappedKey] = finalValue;
            }
        }

        const hasLowConfidence = mappingResult.lowConfidenceFields.length > 0;
        const mappingReport = this.matcher.formatMappingReport(mappingResult);

        console.log(`[SmartMapping] Final data object:`, JSON.stringify(data, null, 2));

        return {
            data,
            mappingReport,
            hasLowConfidence,
            mappingResult,
            usedLegacyMode: false,
            analysis,
        };
    }

    /**
     * Parse an Excel file and return headers + first data row.
     * Handles both single-row and multi-row Excel data (uses first data row for single-file processing).
     */
    private async parseExcelForMapping(excelFilePath: string): Promise<{ headers: string[]; row: Record<string, any> } | null> {
        try {
            const ExcelJS = require('exceljs');
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(excelFilePath);
            const worksheet = workbook.worksheets[0];
            if (!worksheet) return null;

            const headers: string[] = [];
            const headerRow = worksheet.getRow(1);
            headerRow.eachCell((cell: any) => {
                const val = cell.value?.toString()?.trim();
                if (val) headers.push(val);
            });

            if (headers.length === 0) return null;

            // Get first data row
            const dataRow = worksheet.getRow(2);
            const row: Record<string, any> = {};
            headers.forEach((header, idx) => {
                const cell = dataRow.getCell(idx + 1);
                row[header] = cell.value ?? '';
            });

            return { headers, row };
        } catch (error: any) {
            console.error('[SmartMapping] Excel parse error:', error?.message);
            return null;
        }
    }

    /**
     * AI Fallback logic: asks Gemini to extract data for the missing fields
     * based on user instruction and memory data.
     */
    private async generateAiFallback(
        fieldsToFill: string[],
        instruction?: string,
        memoryData?: string
    ): Promise<Record<string, string>> {
        if (!instruction && !memoryData) return {};
        
        const ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
        let prompt = `Extract values for these fields: ${fieldsToFill.join(', ')}.\n`;
        if (instruction) prompt += `User Instruction: ${instruction}\n`;
        if (memoryData) prompt += `Memory Data (use this as primary truth if applicable): ${memoryData}\n`;
        prompt += `Return ONLY a valid JSON object where keys are the exact field names provided and values are the extracted strings. If a field cannot be determined, set its value to "".`;
        
        try {
            const response = await ai.models.generateContent({
                model: 'gemini-2.5-flash',
                contents: prompt,
                config: {
                    responseMimeType: 'application/json'
                }
            });
            return JSON.parse(response.text || '{}');
        } catch (e) {
            console.error('[SmartMapping] AI fallback failed:', e);
            return {};
        }
    }

    /**
     * For non-placeholder templates, determine the key to use in DocumentEngine.
     * Legacy placeholder format: key = the placeholder name (e.g. "tanggal")
     * Non-placeholder format (colon/area/etc): we insert the data into the template
     * by replacing the label line, so we use the label as the key.
     */
    private getDocxFillKey(field: { key: string; label: string; format: string }, analysis: TemplateAnalysis): string {
        if (field.format === 'placeholder') {
            return field.key;
        }
        // For non-placeholder formats, we use the label directly as the template variable key
        // This works together with the enhanced DocumentEngine.fillTemplateSmartMode()
        return field.key;
    }

    /**
     * Convert a cell value to a clean string.
     */
    private formatValue(value: any, fallback: string): string {
        if (value === null || value === undefined || value === '') return fallback;
        if (value instanceof Date) {
            return value.toLocaleDateString('id-ID', { year: 'numeric', month: 'long', day: 'numeric' });
        }
        const str = String(value).trim();
        return str || fallback;
    }

    /**
     * Build a result indicating the caller should use legacy Gemini mode.
     */
    private buildLegacyModeResult(analysis: TemplateAnalysis | null): SmartFillResult {
        return {
            data: {},
            mappingReport: '',
            hasLowConfidence: false,
            mappingResult: {
                mappings: [],
                unmappedExcelColumns: [],
                unmappedTemplateFields: [],
                lowConfidenceFields: [],
            },
            usedLegacyMode: true,
            analysis: analysis || undefined,
        };
    }

    /**
     * Get cached analysis for a template.
     */
    public async getAnalysis(templateId: string) {
        return await this.metadataRepo.getByTemplateId(templateId);
    }

    public getMatcher(): SemanticFieldMatcher {
        return this.matcher;
    }

    public getAnalyzerService(): TemplateAnalyzerService {
        return this.analyzerService;
    }
}
