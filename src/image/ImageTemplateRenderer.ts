// @ts-ignore — no type definitions for this module
import ImageModule from 'docxtemplater-image-module-free';
import { ProcessedImage, PAGE_CONTENT_WIDTH } from './types';

/**
 * Wraps docxtemplater-image-module-free, supplying pre-processed image data.
 *
 * Because docxtemplater's callbacks are synchronous, all heavy async processing
 * (sharp pipelines, AI calls, etc.) must be completed BEFORE this class is
 * instantiated. Pass the finished Map<placeholderName, ProcessedImage> and this
 * renderer creates the correct ImageModule configuration for you.
 */
export class ImageTemplateRenderer {

    /**
     * Creates a configured docxtemplater ImageModule.
     *
     * @param processedImages  Map from placeholder name (without {%}) → ProcessedImage
     * @returns A docxtemplater-compatible module ready to be passed to Docxtemplater
     */
    public createModule(processedImages: Map<string, ProcessedImage>): any {
        return new ImageModule({
            centered:  true,
            fileType:  'docx',

            /**
             * Returns the image buffer for a given placeholder.
             * tagName = the name inside {%tagName}
             */
            getImage: (_tagValue: string, tagName: string): Buffer | null => {
                const img = processedImages.get(tagName);
                if (img) {
                    return img.buffer;
                }
                console.warn(`[ImageTemplateRenderer] No processed image found for {%${tagName}}`);
                return null;
            },

            /**
             * Returns the [width, height] tuple (px) the DOCX will reserve for
             * the image. Since ProcessedImage already has baked-in final dimensions
             * (including border/shadow/margin padding), we simply return them.
             */
            getSize: (
                _imgBuffer: Buffer,
                _tagValue:  string,
                tagName:    string
            ): [number, number] => {
                const img = processedImages.get(tagName);
                if (!img) {
                    return [PAGE_CONTENT_WIDTH, Math.round(PAGE_CONTENT_WIDTH * 0.75)];
                }
                return [img.width, img.height];
            },
        });
    }
}
