import { DocxParser } from '../../parser/docxParser';
import { PlaceholderDetectorService } from './PlaceholderDetectorService';
import { TemplateMetadataRepository, TemplateAnalysis, TemplateField } from '../../repositories/TemplateMetadataRepository';

/**
 * TemplateAnalyzerService
 *
 * Automatically analyzes a DOCX template when it is saved via !save.
 * Detects all fillable fields and stores the result in TemplateMetadataRepository.
 *
 * This is entirely ADDITIVE — it does not modify the existing saveTemplate() workflow.
 * If analysis fails, the template is still saved successfully (analysis is a bonus).
 */
export class TemplateAnalyzerService {
    private static readonly ANALYSIS_VERSION = 1;

    private docxParser: DocxParser;
    private detector: PlaceholderDetectorService;
    private repo: TemplateMetadataRepository;

    constructor(workspaceId?: string) {
        this.docxParser = new DocxParser();
        this.detector = new PlaceholderDetectorService();
        this.repo = new TemplateMetadataRepository(workspaceId);
    }

    public async init(): Promise<void> {
        await this.repo.init();
    }

    /**
     * Analyzes a DOCX template and stores the result.
     * Returns the analysis result so callers can display field info to the user.
     *
     * @param templateId The ID of the template (from TemplateMetadata.id)
     * @param templateFilePath Absolute path to the saved DOCX file
     * @returns TemplateAnalysis or null if analysis failed
     */
    public async analyze(templateId: string, templateFilePath: string): Promise<TemplateAnalysis | null> {
        try {
            console.log(`[TemplateAnalyzer] Starting analysis for template ${templateId}...`);

            const rawText = await this.docxParser.extractText(templateFilePath);
            const hasLegacy = this.detector.hasLegacyPlaceholders(rawText);
            const fields = this.detector.detect(rawText);

            console.log(`[TemplateAnalyzer] Detected ${fields.length} fields. Legacy placeholders: ${hasLegacy}`);
            console.log(`[TemplateAnalyzer] Fields:`, fields.map(f => `${f.key} (${f.format})`).join(', '));

            const analysis: TemplateAnalysis = {
                templateId,
                analysisVersion: TemplateAnalyzerService.ANALYSIS_VERSION,
                analyzedAt: Date.now(),
                fields,
                hasLegacyPlaceholders: hasLegacy,
                rawDocumentText: rawText,
            };

            await this.repo.save(analysis);
            console.log(`[TemplateAnalyzer] Analysis saved for template ${templateId}.`);
            return analysis;

        } catch (error: any) {
            // Analysis failure is NON-FATAL. The template save still succeeds.
            console.error(`[TemplateAnalyzer] Analysis failed for template ${templateId}:`, error?.message || error);
            return null;
        }
    }

    /**
     * Retrieves a previously stored analysis.
     */
    public async getAnalysis(templateId: string): Promise<TemplateAnalysis | undefined> {
        return await this.repo.getByTemplateId(templateId);
    }

    /**
     * Deletes stored analysis when a template is deleted.
     */
    public async deleteAnalysis(templateId: string): Promise<void> {
        await this.repo.delete(templateId);
    }

    /**
     * Returns a human-readable summary of the detected fields (for bot messages).
     */
    public formatFieldSummary(analysis: TemplateAnalysis): string {
        if (analysis.fields.length === 0) {
            return '📋 Tidak ada field yang terdeteksi secara otomatis. Pastikan template menggunakan placeholder yang dikenal.';
        }

        const textFields = analysis.fields.filter(f => !f.isImage);
        const imageFields = analysis.fields.filter(f => f.isImage);

        const lines: string[] = [
            `📋 **Field Terdeteksi: ${analysis.fields.length}**`,
        ];

        if (analysis.hasLegacyPlaceholders) {
            lines.push('✅ Template menggunakan format placeholder lama `{{...}}` — akan diproses seperti biasa.');
        } else {
            lines.push('🤖 Template menggunakan format teks bebas — AI akan mengisi otomatis.');
        }

        if (textFields.length > 0) {
            lines.push(`\n📝 **Field Teks (${textFields.length}):**`);
            textFields.forEach(f => lines.push(`  • \`${f.label}\` _(${f.format})_`));
        }

        if (imageFields.length > 0) {
            lines.push(`\n🖼️ **Field Gambar (${imageFields.length}):**`);
            imageFields.forEach(f => lines.push(`  • \`${f.label}\` _(${f.format})_`));
        }

        return lines.join('\n');
    }
}
