import { ImageProcessor } from './ImageProcessor';
import { ImageLayoutService } from './ImageLayoutService';
import { ImageTemplateRenderer } from './ImageTemplateRenderer';
import { ImagePlaceholderService } from './ImagePlaceholderService';
import {
    ImagePlacementOptions,
    ImageLayoutConfig,
    ProcessedImage,
    PlacementMode,
    PLACEMENT_MODES,
    LayoutType,
    ContainerBounds
} from './types';

/** Minimal interface so ImageEngine doesn't import the full GeminiService */
interface SimpleAI {
    generateSimple(prompt: string): Promise<string>;
}

/**
 * ImageEngine — Facade
 *
 * This is the single entry-point callers use. It orchestrates:
 *   • ImageProcessor   — individual image transforms
 *   • ImageLayoutService — multi-image compositing
 *   • ImageTemplateRenderer — docxtemplater module creation
 *   • AI (optional) — `auto_ai` mode resolution via Gemini
 */
export class ImageEngine {
    private processor: ImageProcessor;
    private layoutService: ImageLayoutService;
    public  renderer: ImageTemplateRenderer;
    private ai?: SimpleAI;

    constructor(ai?: SimpleAI) {
        this.processor    = new ImageProcessor();
        this.layoutService = new ImageLayoutService();
        this.renderer     = new ImageTemplateRenderer();
        this.ai           = ai;
    }

    // ─── Single-image processing ──────────────────────────────────────────────

    /**
     * Process one image file and return a DOCX-ready ProcessedImage.
     * If mode is `auto_ai`, calls Gemini to select the best mode first.
     */
    public async process(
        filePath: string,
        options: ImagePlacementOptions = {},
        bounds: ContainerBounds | null = null
    ): Promise<ProcessedImage> {
        let resolvedOptions = { ...options };

        if (options.mode === 'auto_ai') {
            const meta = await this.getMetadata(filePath);
            const mode = await this.resolveAutoMode('document image', meta.w, meta.h);
            resolvedOptions = { ...options, mode };
            console.log(`[ImageEngine] auto_ai resolved to: ${mode}`);
        }

        return this.processor.process(filePath, resolvedOptions, bounds);
    }

    // ─── Multi-image layout ───────────────────────────────────────────────────

    /**
     * Compose multiple images into a single ProcessedImage using a layout config.
     */
    public async processLayout(
        filePaths: string[],
        config: ImageLayoutConfig
    ): Promise<ProcessedImage> {
        return this.layoutService.compose(filePaths, config);
    }

    // ─── Batch processing for a document ─────────────────────────────────────

    /**
     * Process all images for a set of template placeholders and build the
     * ImageModule needed by DocumentEngine.fillTemplate.
     *
     * When layout type is NOT 'single', ALL image files are composited into a
     * single image and mapped to the first placeholder.
     *
     * @param placeholderFileMap  { placeholderName → filePath }
     * @param options             Global placement options applied to every image
     * @returns { module, processedImages } — module goes into Docxtemplater,
     *          processedImages is available for inspection / captions
     */
    public async prepareForDocument(
        placeholderFileMap: Record<string, string>,
        options: ImagePlacementOptions = {},
        docxBuffer?: Buffer
    ): Promise<{
        module: any;
        processedImages: Map<string, ProcessedImage>;
    }> {
        const processed = new Map<string, ProcessedImage>();
        const layout = options.layout ?? 'single';
        
        // If we have the DOCX buffer, extract bounds for all placeholders
        let boundsMap: Record<string, ContainerBounds> = {};
        if (docxBuffer) {
            boundsMap = ImagePlaceholderService.extractBounds(docxBuffer, Object.keys(placeholderFileMap));
        }

        if (layout !== 'single') {
            // Composite all images into one and map to the first placeholder
            const [firstKey]  = Object.keys(placeholderFileMap);
            const allPaths    = Object.values(placeholderFileMap);
            // Default to Fit Cell if composite bounds are found
            if (boundsMap[firstKey] && !options.mode) {
                options.mode = 'fit_cell';
            }
            const composite   = await this.processLayout(allPaths, { type: layout });
            // Since layout compositor doesn't do alignment/cell-fit yet, we can wrap it through process
            // But layout is usually for larger composite scenarios. Let's just return it for now.
            // Wait, we can pass composite buffer to Processor! But process takes a filePath.
            processed.set(firstKey, composite);
        } else {
            // Process each placeholder independently
            for (const [name, filePath] of Object.entries(placeholderFileMap)) {
                try {
                    // Inject smart mode if semantic name matches and auto_ai is not explicitly used,
                    // or if it's the default 'fit_cell' behavior.
                    let localOptions = { ...options };
                    const lowerName = name.toLowerCase();
                    
                    if (!localOptions.mode || localOptions.mode === 'fit_cell') {
                        if (lowerName.includes('signature')) {
                            localOptions.mode = 'signature';
                        } else if (lowerName.includes('logo')) {
                            localOptions.mode = 'logo';
                        } else if (localOptions.mode !== 'fit_cell') {
                            localOptions.mode = 'fit_cell'; // Default Smart Image Engine mode
                        }
                    }

                    const bounds = boundsMap[name] || null;
                    const img = await this.process(filePath, localOptions, bounds);
                    processed.set(name, img);
                } catch (err) {
                    console.error(`[ImageEngine] Failed to process {%${name}}: ${(err as any).message}`);
                }
            }
        }

        const module = this.renderer.createModule(processed);
        return { module, processedImages: processed };
    }

    // ─── auto_ai mode resolver ────────────────────────────────────────────────

    /**
     * Uses Gemini to select the best placement mode for an image based on
     * its dimensions and the document context string.
     * Falls back to 'fit_to_width' when AI is unavailable.
     */
    public async resolveAutoMode(
        documentContext: string,
        naturalW: number,
        naturalH: number
    ): Promise<PlacementMode> {
        if (!this.ai) return 'fit_to_width';

        const validModes = PLACEMENT_MODES.filter(m => m !== 'auto_ai').join(', ');
        const prompt = [
            'You are an expert document layout designer.',
            `The document context is: "${documentContext}".`,
            `The image has natural dimensions: ${naturalW}x${naturalH}px.`,
            `Available placement modes: ${validModes}.`,
            'Select the single most appropriate mode for inserting this image.',
            'Respond with ONLY the mode name and nothing else.',
        ].join(' ');

        try {
            const reply   = await this.ai.generateSimple(prompt);
            const cleaned = reply.trim().toLowerCase().replace(/[^a-z_]/g, '') as PlacementMode;
            if ((PLACEMENT_MODES as readonly string[]).includes(cleaned)) {
                return cleaned;
            }
        } catch (err) {
            console.warn('[ImageEngine] auto_ai resolution failed, defaulting to fit_to_width:', (err as any).message);
        }

        return 'fit_to_width';
    }

    // ─── Metadata query ───────────────────────────────────────────────────────

    public async getMetadata(filePath: string): Promise<{ w: number; h: number }> {
        const sharp = (await import('sharp')).default;
        const meta  = await sharp(filePath).rotate().metadata();
        return { w: meta.width ?? 800, h: meta.height ?? 600 };
    }

    // ─── Mode catalogue (for API) ─────────────────────────────────────────────

    public static getAvailableModes() {
        const { CROP_MODES, LAYOUT_TYPES } = require('./types');
        return {
            modes:       [...PLACEMENT_MODES],
            cropModes:   [...CROP_MODES],
            layoutTypes: [...LAYOUT_TYPES],
        };
    }
}
