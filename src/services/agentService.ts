import path from 'path';
import { FileHandler } from '../utils/fileHandler';
import { DocxParser } from '../parser/docxParser';
import { GeminiService, ImageData } from '../ai/geminiService';
import { DeepseekService } from '../ai/deepseekService';
import { DocumentEngine, ImagePlaceholderMap } from '../document/documentEngine';
import { config } from '../config/env';
import { ImageEngine } from '../image/ImageEngine';
import { ImagePlacementOptions } from '../image/types';

import { TemplateRepo, TemplateMetadata } from '../repositories/templateRepo';
import { HistoryRepo, HistoryRecord } from '../repositories/historyRepo';
import { SettingsRepo, AppSettings } from '../repositories/settingsRepo';
import { LogRepo } from '../repositories/logRepo';
import { MemoryRepo } from '../repositories/memoryRepo';
import { ExcelParser } from '../parser/excelParser';
import { TemplateService } from './templateService';
import { TemplateManager } from '../managers/templateManager';
import { SmartMappingService } from './ai/SmartMappingService';

export class AgentService {
    public fileHandler: FileHandler;
    public docxParser: DocxParser;
    public excelParser: ExcelParser;
    public geminiService: GeminiService; // Made public for Chat access
    public deepseekService?: DeepseekService; // Made public for Chat access
    public documentEngine: DocumentEngine;
    public imageEngine: ImageEngine; // Made public for direct access from controllers

    public templateRepo: TemplateRepo;
    public historyRepo: HistoryRepo;
    public settingsRepo: SettingsRepo;
    public logRepo: LogRepo;
    public memoryRepo: MemoryRepo;
    
    public templateService: TemplateService;
    public templateManager: TemplateManager;
    public smartMappingService: SmartMappingService;
    
    private workspaceId?: string;

    constructor(workspaceId?: string) {
        this.workspaceId = workspaceId;
        this.fileHandler = new FileHandler();
        this.docxParser = new DocxParser();
        this.excelParser = new ExcelParser();
        this.geminiService = GeminiService.getInstance();
        if (config.deepseekApiKey) {
            // this.deepseekService = DeepseekService.getInstance();
            const { DeepseekService } = require('../ai/deepseekService');
            this.deepseekService = DeepseekService.getInstance();
        }
        this.documentEngine = new DocumentEngine();
        this.imageEngine = new ImageEngine(this.geminiService);

        this.templateRepo = new TemplateRepo(workspaceId);
        this.historyRepo = new HistoryRepo(workspaceId);
        this.settingsRepo = new SettingsRepo(workspaceId);
        this.logRepo = new LogRepo(workspaceId);
        this.memoryRepo = new MemoryRepo(workspaceId);
        
        this.templateService = new TemplateService(workspaceId);
        this.templateManager = TemplateManager.getInstance();
        this.smartMappingService = new SmartMappingService(workspaceId);
    }

    public async init() {
        await this.templateRepo.init();
        await this.historyRepo.init();
        await this.settingsRepo.init();
        await this.logRepo.init();
        await this.memoryRepo.init();
        await this.templateService.init();
        await this.smartMappingService.init();
        await this.logRepo.log('info', 'AgentService initialized successfully.');
    }

    public setWorkspace(workspaceId?: string) {
        this.workspaceId = workspaceId;
        this.templateRepo = new TemplateRepo(workspaceId);
        this.historyRepo = new HistoryRepo(workspaceId);
        this.settingsRepo = new SettingsRepo(workspaceId);
        this.logRepo = new LogRepo(workspaceId);
        this.memoryRepo = new MemoryRepo(workspaceId);
    }

    /**
     * Processes a user's document request.
     * @param fileUrl URL to download the template DOCX
     * @param userInstruction The instruction text from the user
     * @param userId The user's ID for generating unique filenames
     * @param imageUrls Optional array of image URLs — mapped IN ORDER to image placeholders
     * @returns An object containing paths to the generated DOCX and optional PDF
     */
    public async processDocument(
        fileUrlOrPath: string,
        userInstruction: string,
        userId: string,
        imageUrls?: string[],
        provider: 'gemini' | 'deepseek' = 'gemini',
        memoryData?: string,
        imageOptions?: ImagePlacementOptions,  // NEW — ImageEngine placement options
        excelUrls?: string[]                   // NEW — Excel files for AI Excel Understanding
    ): Promise<{ documentPath: string; pdfPath?: string }> {
        const timestamp = Date.now();
        const templateFilename = `template_${userId}_${timestamp}.docx`;
        const outputDocxFilename = `result_${userId}_${timestamp}.docx`;
        const outputPdfFilename = `result_${userId}_${timestamp}.pdf`;

        let templatePath = '';
        const imagePaths: string[] = [];
        const excelPaths: string[] = [];
        let docxPath = '';
        let pdfPath = '';

        try {
            // 1. Get template DOCX path
            if (fileUrlOrPath.startsWith('http://') || fileUrlOrPath.startsWith('https://')) {
                console.log(`Downloading template for user ${userId}...`);
                templatePath = await this.fileHandler.downloadFile(fileUrlOrPath, templateFilename);
            } else {
                console.log(`Using local active template for user ${userId}...`);
                templatePath = fileUrlOrPath;
                // Note: when using local active template, we do not clean it up at the end 
                // if it's meant to be reused, but cleanupResults cleans specific results, not the input template.
            }

            // 2. Download all images if provided
            const imagesData: ImageData[] = [];
            if (imageUrls && imageUrls.length > 0) {
                for (let i = 0; i < imageUrls.length; i++) {
                    const imageUrl = imageUrls[i];
                    const imageExt = this.getImageExtension(imageUrl);
                    const imageFilename = `image_${userId}_${timestamp}_${i + 1}.${imageExt}`;
                    const imgPath = await this.fileHandler.downloadFile(imageUrl, imageFilename);
                    imagePaths.push(imgPath);
                    imagesData.push({ path: imgPath, mimeType: this.getMimeType(imageExt) });
                    console.log(`[AgentService] Image ${i + 1} downloaded: ${imgPath}`);
                }
            }

            // 2b. Download and parse Excel files if provided
            let parsedExcelData = '';
            if (excelUrls && excelUrls.length > 0) {
                for (let i = 0; i < excelUrls.length; i++) {
                    const excelUrl = excelUrls[i];
                    const excelFilename = `excel_${userId}_${timestamp}_${i + 1}.xlsx`;
                    const excelPath = await this.fileHandler.downloadFile(excelUrl, excelFilename);
                    excelPaths.push(excelPath);
                    console.log(`[AgentService] Excel ${i + 1} downloaded: ${excelPath}`);
                    
                    const extractedText = await this.excelParser.extractText(excelPath);
                    parsedExcelData += `\n=== Data Excel ${i + 1} ===\n${extractedText}\n========================\n`;
                }
            }

            // 3. Try Smart Mapping First (Features 1-6)
            let textData: Record<string, any> | undefined;
            let smartAnalysis: any;
            try {
                console.log(`[AgentService] Trying Smart Mapping...`);
                await this.smartMappingService.init();
                const templateId = `temp_${timestamp}`; // Temporary ID for one-off documents
                const firstExcelPath = excelPaths.length > 0 ? excelPaths[0] : null;

                const smartResult = await this.smartMappingService.buildFillData(
                    templateId,
                    templatePath,
                    firstExcelPath,
                    '-',
                    memoryData,
                    userInstruction
                );

                if (!smartResult.usedLegacyMode && Object.keys(smartResult.data).length > 0) {
                    textData = smartResult.data;
                    smartAnalysis = smartResult.analysis;
                    console.log(`[AgentService] Smart Mapping data generated.`);
                }
            } catch (err) {
                console.warn('[AgentService] Smart mapping failed, falling back to legacy:', err);
            }

            // 4. Fallback to Legacy Gemini mode if smart mapping skipped or failed
            let imagePlaceholderNames: string[] = [];
            
            if (!textData) {
                console.log(`Extracting text from template for legacy AI...`);
                const documentText = await this.docxParser.extractText(templatePath);

                console.log(`Asking AI (${provider}) to generate data...`);
                let finalInstruction = userInstruction;
                if (memoryData) {
                    finalInstruction += `\n\n=== DATA MEMORY REFERENSI DARI USER ===\n${memoryData}\n=====================================\n`;
                }

                const ai = provider === 'deepseek' && this.deepseekService ? this.deepseekService : this.geminiService;
                const result = await ai.generateDocumentData(
                    documentText,
                    finalInstruction,
                    imagesData.length > 0 ? imagesData : undefined,
                    parsedExcelData ? parsedExcelData : undefined
                );
                textData = result.textData;
                imagePlaceholderNames = result.imagePlaceholderNames;
                console.log(`[AgentService] Text data from ${provider}:`, JSON.stringify(textData, null, 2));
            } else if (smartAnalysis) {
                // In Smart Mapping mode, extract image placeholder names from analysis
                imagePlaceholderNames = smartAnalysis.fields
                    .filter((f: any) => f.isImage)
                    .map((f: any) => f.key);
            }

            console.log(`[AgentService] Image placeholders in template (in order):`, imagePlaceholderNames);

            // 5. Map images to placeholders IN ORDER
            // Image 1 → {%gambar1}, Image 2 → {%gambar2}, Image 3 → {%gambar3}, ...
            const imagePlaceholders: ImagePlaceholderMap = {};
            if (imagePaths.length > 0 && imagePlaceholderNames.length > 0) {
                for (let i = 0; i < imagePlaceholderNames.length; i++) {
                    const placeholderName = imagePlaceholderNames[i];
                    // If we have an image for this index, use it. Otherwise use the last available image.
                    const imgPath = imagePaths[i] ?? imagePaths[imagePaths.length - 1];
                    imagePlaceholders[placeholderName] = imgPath;
                    console.log(`[AgentService] Mapping {%${placeholderName}} → image ${Math.min(i + 1, imagePaths.length)}`);
                }
            }

            // 6. Fill template with text data + image placeholders
            console.log(`Filling DOCX template...`);
            docxPath = await this.documentEngine.fillTemplate(
                templatePath,
                textData,
                outputDocxFilename,
                Object.keys(imagePlaceholders).length > 0 ? imagePlaceholders : undefined,
                imageOptions || {},
                smartAnalysis // Pass the analysis for Smart XML Injection
            );

            // 7. Convert to PDF
            console.log(`Converting to PDF...`);
            try {
                pdfPath = await this.documentEngine.convertToPdf(docxPath, outputPdfFilename);
            } catch (pdfError) {
                console.error('PDF conversion failed, continuing with DOCX only:', pdfError);
            }

            // Persist files
            docxPath = this.persistFile(docxPath, outputDocxFilename);
            if (pdfPath) {
                pdfPath = this.persistFile(pdfPath, outputPdfFilename);
            }

            return { documentPath: docxPath, pdfPath };
        } catch (error) {
            console.error('Error in AgentService processDocument:', error);
            throw error;
        } finally {
            if (templatePath && (fileUrlOrPath.startsWith('http://') || fileUrlOrPath.startsWith('https://'))) {
                this.fileHandler.cleanupFile(templatePath);
            }
            for (const imgPath of imagePaths) this.fileHandler.cleanupFile(imgPath);
            for (const excelPath of excelPaths) this.fileHandler.cleanupFile(excelPath);
        }
    }

    /**
     * Processes a document request using a locally saved template.
     */
    public async processSavedTemplate(
        templateId: string,
        userInstruction: string,
        userId: string,
        imageUrls?: string[],
        provider: 'gemini' | 'deepseek' = 'gemini',
        memoryData?: string,
        imageOptions?: ImagePlacementOptions   // NEW
    ): Promise<{ documentPath: string; pdfPath?: string; templateName: string }> {
        const metadata = await this.templateRepo.getById(templateId);
        if (!metadata) {
            throw new Error(`Template dengan ID ${templateId} tidak ditemukan.`);
        }

        const timestamp = Date.now();
        const outputDocxFilename = `result_${userId}_${timestamp}.docx`;
        const outputPdfFilename = `result_${userId}_${timestamp}.pdf`;
        
        const imagePaths: string[] = [];
        let docxPath = '';
        let pdfPath = '';

        try {
            // Try Smart Mapping First (Features 1-6)
            let textData: Record<string, any> | undefined;
            let smartAnalysis: any;
            try {
                console.log(`[AgentService] Trying Smart Mapping for saved template...`);
                // Ensure initialized
                await this.smartMappingService.init();
                const smartResult = await this.smartMappingService.buildFillData(
                    templateId,
                    metadata.filePath,
                    null, // No excel for saved template process
                    '-',  // Fallback value
                    memoryData,
                    userInstruction
                );
                
                if (!smartResult.usedLegacyMode && Object.keys(smartResult.data).length > 0) {
                    textData = smartResult.data;
                    smartAnalysis = smartResult.analysis;
                    console.log(`[AgentService] Smart Mapping data generated.`);
                }
            } catch (err) {
                console.warn('[AgentService] Smart mapping failed, falling back to legacy:', err);
            }

            // Fallback to legacy Gemini mode if smart mapping skipped or failed
            if (!textData) {
                console.log(`Extracting text from saved template ${metadata.name} for legacy AI...`);
                const documentText = await this.docxParser.extractText(metadata.filePath);

                let finalInstruction = userInstruction;
                if (memoryData) {
                    finalInstruction += `\n\n=== DATA MEMORY REFERENSI DARI USER ===\n${memoryData}\n=====================================\n`;
                }

                console.log(`Asking AI (${provider}) to generate data...`);
                const ai = provider === 'deepseek' && this.deepseekService ? this.deepseekService : this.geminiService;
                const result = await ai.generateDocumentData(documentText, finalInstruction);
                textData = result.textData;
                console.log(`[AgentService] Text data from ${provider}:`, JSON.stringify(textData, null, 2));
            }

            // Fill template
            console.log(`Filling DOCX template...`);
            docxPath = await this.documentEngine.fillTemplate(
                metadata.filePath,
                textData,
                outputDocxFilename,
                Object.keys(imagePaths).length > 0 ? { "placeholder": imagePaths[0] } : undefined,
                imageOptions || {},
                smartAnalysis // Pass the analysis for Smart XML Injection
            );

            // Convert to PDF
            console.log(`Converting to PDF...`);
            try {
                pdfPath = await this.documentEngine.convertToPdf(docxPath, outputPdfFilename);
            } catch (pdfError) {
                console.error('PDF conversion failed, continuing with DOCX only:', pdfError);
            }

            // Persist files
            docxPath = this.persistFile(docxPath, outputDocxFilename);
            if (pdfPath) {
                pdfPath = this.persistFile(pdfPath, outputPdfFilename);
            }

            return { documentPath: docxPath, pdfPath, templateName: metadata.name };
        } catch (error) {
            console.error('Error in AgentService processSavedTemplate:', error);
            throw error;
        }
    }

    /**
     * Cleans up the generated result files after they have been sent.
     */
    public cleanupResults(filepaths: (string | undefined)[]): void {
        // We no longer delete the results because they are saved to the workspace
        // for (const filepath of filepaths) {
        //     if (filepath) this.fileHandler.cleanupFile(filepath);
        // }
    }

    private persistFile(tempPath: string, finalName: string): string {
        const fs = require('fs');
        const destDir = this.workspaceId 
            ? path.resolve(process.cwd(), `storage/workspaces/${this.workspaceId}/documents`)
            : path.resolve(process.cwd(), 'storage/documents');
        
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }

        const destPath = path.resolve(destDir, finalName);
        fs.copyFileSync(tempPath, destPath);
        this.fileHandler.cleanupFile(tempPath);
        return destPath;
    }

    private getImageExtension(url: string): string {
        const cleanUrl = url.split('?')[0];
        const ext = path.extname(cleanUrl).replace('.', '').toLowerCase();
        return ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext) ? ext : 'jpg';
    }

    private getMimeType(ext: string): string {
        const mimeTypes: Record<string, string> = {
            jpg: 'image/jpeg',
            jpeg: 'image/jpeg',
            png: 'image/png',
            gif: 'image/gif',
            webp: 'image/webp',
        };
        return mimeTypes[ext] || 'image/jpeg';
    }

    /**
     * Generates a new document from scratch based on a user instruction.
     */
    public async generateDocumentFromScratch(
        userInstruction: string,
        userId: string,
        imageUrls?: string[],
        provider: 'gemini' | 'deepseek' = 'gemini',
        memoryData?: string
    ): Promise<{ documentPath: string; pdfPath?: string }> {
        const timestamp = Date.now();
        
        const imagePaths: string[] = [];
        let documentPath = '';
        let pdfPath = '';

        try {
            // 1. Download images if provided
            const imagesData: ImageData[] = [];
            if (imageUrls && imageUrls.length > 0) {
                for (let i = 0; i < imageUrls.length; i++) {
                    const imageUrl = imageUrls[i];
                    const imageExt = this.getImageExtension(imageUrl);
                    const imageFilename = `image_gen_${userId}_${timestamp}_${i + 1}.${imageExt}`;
                    const imgPath = await this.fileHandler.downloadFile(imageUrl, imageFilename);
                    imagePaths.push(imgPath);
                    imagesData.push({ path: imgPath, mimeType: this.getMimeType(imageExt) });
                }
            }

            // 2. Ask AI to generate document structure
            console.log(`Asking AI (${provider}) to generate document structure...`);
            // Setup instruction with memory if available
            let finalInstruction = userInstruction;
            if (memoryData) {
                finalInstruction += `\n\n=== DATA MEMORY REFERENSI DARI USER ===\n${memoryData}\n=====================================\n`;
            }

            const ai = provider === 'deepseek' && this.deepseekService ? this.deepseekService : this.geminiService;
            const structure = await ai.generateDocumentStructure(
                finalInstruction,
                imagesData.length > 0 ? imagesData : undefined
            );
            console.log(`[AgentService] Document structure from ${provider}:`, JSON.stringify(structure, null, 2));

            // Determine filenames and format
            const safeTitle = (structure.title || 'Dokumen_Baru').replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const format = structure.format === 'xlsx' ? 'xlsx' : 'docx';
            
            const outputFilename = `${safeTitle}_${userId}_${timestamp}.${format}`;
            const outputPdfFilename = `${safeTitle}_${userId}_${timestamp}.pdf`;

            if (format === 'xlsx') {
                // Create XLSX from structure
                console.log(`Generating XLSX...`);
                documentPath = await this.documentEngine.createExcelFromScratch(structure, outputFilename);
            } else {
                // Create DOCX from structure
                console.log(`Generating DOCX...`);
                documentPath = await this.documentEngine.createDocumentFromScratch(structure, outputFilename);

                // Convert to PDF (only for DOCX)
                console.log(`Converting to PDF...`);
                try {
                    pdfPath = await this.documentEngine.convertToPdf(documentPath, outputPdfFilename);
                } catch (pdfError) {
                    console.error('PDF conversion failed, continuing with DOCX only:', pdfError);
                }
            }

            // Persist files
            documentPath = this.persistFile(documentPath, outputFilename);
            if (pdfPath) {
                pdfPath = this.persistFile(pdfPath, outputPdfFilename);
            }

            return { documentPath, pdfPath };
        } catch (error) {
            console.error('Error in AgentService generateDocumentFromScratch:', error);
            throw error;
        } finally {
            for (const imgPath of imagePaths) this.fileHandler.cleanupFile(imgPath);
        }
    }

    /**
     * Saves a new template to the storage and database.
     */
    public async saveTemplate(fileUrl: string, originalName: string, category: string = 'General'): Promise<TemplateMetadata> {
        const id = Date.now().toString();
        const safeName = originalName.replace(/[^a-zA-Z0-9.\-_]/g, '_');
        const filename = `${id}_${safeName}`;
        
        try {
            const tempPath = await this.fileHandler.downloadFile(fileUrl, filename);
            const fs = require('fs');
            const destDir = this.workspaceId 
                ? path.resolve(process.cwd(), `storage/workspaces/${this.workspaceId}/templates`)
                : path.resolve(process.cwd(), 'storage/templates');
            
            if (!fs.existsSync(destDir)) {
                fs.mkdirSync(destDir, { recursive: true });
            }

            const destPath = path.resolve(destDir, filename);
            
            // Move file to permanent storage
            fs.copyFileSync(tempPath, destPath);
            this.fileHandler.cleanupFile(tempPath);

            const stats = fs.statSync(destPath);
            
            const metadata: TemplateMetadata = {
                id,
                name: safeName,
                category,
                uploadDate: Date.now(),
                sizeBytes: stats.size,
                usageCount: 0,
                isFavorite: false,
                filePath: destPath
            };

            await this.templateRepo.add(metadata);

            // ── FEATURE 4: Auto Field Learning ─────────────────────────────────
            // Non-fatal: if analysis fails, template save still succeeds.
            const ext = path.extname(originalName).toLowerCase();
            if (ext === '.docx') {
                const analysis = await this.smartMappingService.getAnalyzerService().analyze(id, destPath);
                if (analysis) {
                    console.log(`[AgentService] Template ${id} analyzed: ${analysis.fields.length} fields detected.`);
                }
            }

            return metadata;
        } catch (error) {
            console.error('[AgentService] Failed to save template:', error);
            throw new Error('Gagal menyimpan template.');
        }
    }

    /**
     * Downloads a file and saves it as an active template for a user.
     * @param fileUrl URL of the template to download
     * @param userId The user's ID
     * @returns The local path to the downloaded active template
     */
    public async downloadActiveTemplate(fileUrl: string, userId: string): Promise<string> {
        const timestamp = Date.now();
        const templateFilename = `active_template_${userId}_${timestamp}.docx`;
        return await this.fileHandler.downloadFile(fileUrl, templateFilename);
    }

    /**
     * Converts a PDF file to DOCX and persists the result.
     */
    public async convertPdfToWord(fileUrl: string, userId: string): Promise<string> {
        const timestamp = Date.now();
        const inputPdfFilename = `input_${userId}_${timestamp}.pdf`;
        const outputDocxFilename = `output_${userId}_${timestamp}.docx`;

        let pdfPath = '';
        try {
            pdfPath = await this.fileHandler.downloadFile(fileUrl, inputPdfFilename);
            const docxPath = await this.documentEngine.convertToDocx(pdfPath, outputDocxFilename);
            return this.persistFile(docxPath, outputDocxFilename);
        } finally {
            if (pdfPath) {
                this.fileHandler.cleanupFile(pdfPath);
            }
        }
    }

    /**
     * Converts a DOCX file to PDF and persists the result.
     */
    public async convertWordToPdf(fileUrl: string, userId: string): Promise<string> {
        const timestamp = Date.now();
        const inputDocxFilename = `input_${userId}_${timestamp}.docx`;
        const outputPdfFilename = `output_${userId}_${timestamp}.pdf`;

        let docxPath = '';
        try {
            docxPath = await this.fileHandler.downloadFile(fileUrl, inputDocxFilename);
            const pdfPath = await this.documentEngine.convertToPdf(docxPath, outputPdfFilename);
            return this.persistFile(pdfPath, outputPdfFilename);
        } finally {
            if (docxPath) {
                this.fileHandler.cleanupFile(docxPath);
            }
        }
    }
}
