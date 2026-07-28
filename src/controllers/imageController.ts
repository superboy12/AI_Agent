import { Request, Response } from 'express';
import path from 'path';
import fs from 'fs';
import { ImageEngine } from '../image/ImageEngine';
import { ImagePlacementOptions, ImageLayoutConfig, PLACEMENT_MODES, CROP_MODES, LAYOUT_TYPES } from '../image/types';
import { GeminiService } from '../ai/geminiService';

export class ImageController {
    private engine: ImageEngine;

    constructor() {
        this.engine = new ImageEngine(GeminiService.getInstance());
    }

    /** GET /api/image/modes — return all available modes / options */
    public getModes = (_req: Request, res: Response) => {
        res.json(ImageEngine.getAvailableModes());
    };

    /**
     * POST /api/image/process
     * Body (multipart/form-data):
     *   image  — uploaded image file (required)
     *   options — JSON string of ImagePlacementOptions (optional)
     */
    public processImage = async (req: Request, res: Response) => {
        try {
            if (!req.file) {
                return res.status(400).json({ error: 'Image file is required.' });
            }

            const options: ImagePlacementOptions = req.body.options
                ? JSON.parse(req.body.options)
                : { mode: 'fit_to_width' };

            const processed = await this.engine.process(req.file.path, options);

            // Cleanup uploaded temp file
            try { fs.unlinkSync(req.file.path); } catch (_) {}

            res.json({
                success: true,
                image: {
                    base64: processed.buffer.toString('base64'),
                    width:  processed.width,
                    height: processed.height,
                    format: processed.format,
                    caption: processed.caption,
                },
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    /**
     * POST /api/image/layout
     * Body (multipart/form-data):
     *   images[] — uploaded image files (required, up to 9)
     *   config   — JSON string of ImageLayoutConfig (optional)
     */
    public createLayout = async (req: Request, res: Response) => {
        try {
            const files = req.files as Express.Multer.File[] | undefined;
            if (!files || files.length === 0) {
                return res.status(400).json({ error: 'At least one image file is required.' });
            }

            const config: ImageLayoutConfig = req.body.config
                ? JSON.parse(req.body.config)
                : { type: 'grid' };

            const filePaths = files.map(f => f.path);
            const processed = await this.engine.processLayout(filePaths, config);

            // Cleanup uploaded temp files
            for (const fp of filePaths) {
                try { fs.unlinkSync(fp); } catch (_) {}
            }

            res.json({
                success: true,
                image: {
                    base64: processed.buffer.toString('base64'),
                    width:  processed.width,
                    height: processed.height,
                    format: processed.format,
                },
            });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };

    /**
     * POST /api/image/resolve-mode
     * Body (JSON): { instruction: string, width: number, height: number }
     * Calls Gemini to resolve the best placement mode.
     */
    public resolveMode = async (req: Request, res: Response) => {
        try {
            const { instruction = 'document image', width = 800, height = 600 } = req.body;
            const mode = await this.engine.resolveAutoMode(instruction, width, height);
            res.json({ success: true, mode });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    };
}
