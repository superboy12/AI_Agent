import { BaseEngine, DocumentEngineContext } from './BaseEngine';
import fs from 'fs';
import { ImageEngine } from '../../image/ImageEngine';
// @ts-ignore
import ImageModule from 'docxtemplater-image-module-free';
import sharp from 'sharp';

const FULL_WIDTH_PX = 600;

export class SmartImageEngine implements BaseEngine {
    
    public async process(context: DocumentEngineContext): Promise<void> {
        const { zip, data, imagePlaceholders, imageOptions, options } = context;

        if (imagePlaceholders && Object.keys(imagePlaceholders).length > 0) {
            // Pre-process XML to ensure {gambar} or {{gambar}} becomes {%gambar}
            let docXml = zip.file("word/document.xml")?.asText();
            if (docXml) {
                for (const key of Object.keys(imagePlaceholders)) {
                    docXml = docXml.replace(new RegExp(`\\{\\{?${key}\\}\\}?`, 'g'), `{%${key}}`);
                }
                zip.file("word/document.xml", docXml);
            }

            let imageModuleInstance: any;

            if (imageOptions) {
                console.log('[SmartImageEngine] Using rich ImageEngine processing...');
                const engine = new ImageEngine();
                
                // We need the raw DOCX buffer for ImageEngine
                // We can generate it from the current zip state
                const currentDocxBuffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
                
                const { module } = await engine.prepareForDocument(imagePlaceholders, imageOptions, currentDocxBuffer);
                imageModuleInstance = module;
            } else {
                console.log('[SmartImageEngine] Using legacy ImageModule...');
                const normalizedImages = new Map<string, { buffer: Buffer; width: number; height: number; density: number }>();

                for (const [placeholderName, filePath] of Object.entries(imagePlaceholders)) {
                    if (fs.existsSync(filePath)) {
                        const normalized = await this.normalizeImage(filePath);
                        normalizedImages.set(placeholderName, normalized);
                    } else {
                        console.warn(`[SmartImageEngine] Image file not found: ${filePath}`);
                    }
                }

                imageModuleInstance = new ImageModule({
                    centered: false,
                    fileType: 'docx',
                    getImage: (tagValue: string, tagName: string) => {
                        const img = normalizedImages.get(tagName);
                        return img ? img.buffer : null;
                    },
                    getSize: (imgBuffer: Buffer, tagValue: string, tagName: string) => {
                        const img = normalizedImages.get(tagName);
                        if (!img) return [FULL_WIDTH_PX, Math.round(FULL_WIDTH_PX * 0.75)];

                        const density = img.density || 96;
                        const naturalWidthPx = Math.round((img.width / density) * 96);
                        const naturalHeightPx = Math.round((img.height / density) * 96);

                        if (naturalWidthPx > FULL_WIDTH_PX) {
                            const scale = FULL_WIDTH_PX / naturalWidthPx;
                            return [FULL_WIDTH_PX, Math.round(naturalHeightPx * scale)];
                        }

                        return [naturalWidthPx, naturalHeightPx];
                    }
                });
            }

            context.modules.push(imageModuleInstance);

            // Docxtemplater needs a truthy value for each image placeholder key
            for (const key of Object.keys(imagePlaceholders)) {
                data[key] = true;
            }
        }
    }

    private async normalizeImage(filePath: string): Promise<{ buffer: Buffer; width: number; height: number; density: number }> {
        const pipeline = sharp(filePath).rotate();
        const metadata = await pipeline.metadata();
        const buffer = await pipeline.toBuffer();

        return {
            buffer,
            width: metadata.width || FULL_WIDTH_PX,
            height: metadata.height || Math.round(FULL_WIDTH_PX * 0.75),
            density: metadata.density || 96,
        };
    }
}
