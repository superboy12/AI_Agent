import path from 'path';
import { FileHandler } from '../utils/fileHandler';
import { DocxParser } from '../parser/docxParser';
import { GeminiService, ImageData } from '../ai/geminiService';
import { DocumentEngine, ImagePlaceholderMap } from '../document/documentEngine';

import { TemplateRepo, TemplateMetadata } from '../repositories/templateRepo';
import { HistoryRepo, HistoryRecord } from '../repositories/historyRepo';
import { SettingsRepo, AppSettings } from '../repositories/settingsRepo';
import { LogRepo } from '../repositories/logRepo';

export class AgentService {
    private fileHandler: FileHandler;
    private docxParser: DocxParser;
    public geminiService: GeminiService; // Made public for Chat access
    private documentEngine: DocumentEngine;

    public templateRepo: TemplateRepo;
    public historyRepo: HistoryRepo;
    public settingsRepo: SettingsRepo;
    public logRepo: LogRepo;

    constructor() {
        this.fileHandler = new FileHandler();
        this.docxParser = new DocxParser();
        this.geminiService = new GeminiService();
        this.documentEngine = new DocumentEngine();

        this.templateRepo = new TemplateRepo();
        this.historyRepo = new HistoryRepo();
        this.settingsRepo = new SettingsRepo();
        this.logRepo = new LogRepo();
    }

    public async init() {
        await this.templateRepo.init();
        await this.historyRepo.init();
        await this.settingsRepo.init();
        await this.logRepo.init();
        await this.logRepo.log('info', 'AgentService initialized successfully.');
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
        fileUrl: string,
        userInstruction: string,
        userId: string,
        imageUrls?: string[]
    ): Promise<{ docxPath: string; pdfPath?: string }> {
        const timestamp = Date.now();
        const templateFilename = `template_${userId}_${timestamp}.docx`;
        const outputDocxFilename = `result_${userId}_${timestamp}.docx`;
        const outputPdfFilename = `result_${userId}_${timestamp}.pdf`;

        let templatePath = '';
        const imagePaths: string[] = [];
        let docxPath = '';
        let pdfPath = '';

        try {
            // 1. Download template DOCX
            console.log(`Downloading template for user ${userId}...`);
            templatePath = await this.fileHandler.downloadFile(fileUrl, templateFilename);

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

            // 3. Read document text
            console.log(`Extracting text from template...`);
            const documentText = await this.docxParser.extractText(templatePath);

            // 4. Ask Gemini to fill text placeholders (and optionally read the images)
            console.log(`Asking Gemini to generate data...`);
            const { textData, imagePlaceholderNames } = await this.geminiService.generateDocumentData(
                documentText,
                userInstruction,
                imagesData.length > 0 ? imagesData : undefined
            );
            console.log(`[AgentService] Text data from Gemini:`, JSON.stringify(textData, null, 2));
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
                Object.keys(imagePlaceholders).length > 0 ? imagePlaceholders : undefined
            );

            // 7. Convert to PDF
            console.log(`Converting to PDF...`);
            try {
                pdfPath = await this.documentEngine.convertToPdf(docxPath, outputPdfFilename);
            } catch (pdfError) {
                console.error('PDF conversion failed, continuing with DOCX only:', pdfError);
            }

            return { docxPath, pdfPath };
        } catch (error) {
            console.error('Error in AgentService processDocument:', error);
            throw error;
        } finally {
            if (templatePath) this.fileHandler.cleanupFile(templatePath);
            for (const imgPath of imagePaths) this.fileHandler.cleanupFile(imgPath);
        }
    }

    /**
     * Cleans up the generated result files after they have been sent.
     */
    public cleanupResults(filepaths: (string | undefined)[]): void {
        for (const filepath of filepaths) {
            if (filepath) this.fileHandler.cleanupFile(filepath);
        }
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
        imageUrls?: string[]
    ): Promise<{ docxPath: string; pdfPath?: string }> {
        const timestamp = Date.now();
        
        const imagePaths: string[] = [];
        let docxPath = '';
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

            // 2. Ask Gemini to generate document structure
            console.log(`Asking Gemini to generate document structure...`);
            const structure = await this.geminiService.generateDocumentStructure(
                userInstruction,
                imagesData.length > 0 ? imagesData : undefined
            );
            console.log(`[AgentService] Document structure from Gemini:`, JSON.stringify(structure, null, 2));

            // Determine filenames
            const safeTitle = (structure.title || 'Dokumen_Baru').replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const outputDocxFilename = `${safeTitle}_${userId}_${timestamp}.docx`;
            const outputPdfFilename = `${safeTitle}_${userId}_${timestamp}.pdf`;

            // 3. Create DOCX from structure
            console.log(`Generating DOCX...`);
            docxPath = await this.documentEngine.createDocumentFromScratch(structure, outputDocxFilename);

            // 4. Convert to PDF
            console.log(`Converting to PDF...`);
            try {
                pdfPath = await this.documentEngine.convertToPdf(docxPath, outputPdfFilename);
            } catch (pdfError) {
                console.error('PDF conversion failed, continuing with DOCX only:', pdfError);
            }

            return { docxPath, pdfPath };
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
            const destPath = path.resolve(process.cwd(), 'storage/templates', filename);
            
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
            return metadata;
        } catch (error) {
            console.error('[AgentService] Failed to save template:', error);
            throw new Error('Gagal menyimpan template.');
        }
    }
}
