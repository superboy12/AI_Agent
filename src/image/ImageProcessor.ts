import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import {
    ImagePlacementOptions,
    ProcessedImage,
    CropMode,
    ResizeOptions,
    BorderOptions,
    ShadowOptions,
    MarginOptions,
    PlacementMode,
    ContainerBounds,
    Alignment,
    PAGE_CONTENT_WIDTH,
    PAGE_CONTENT_HEIGHT,
    PAGE_FULL_WIDTH,
    PAGE_FULL_HEIGHT,
    HEADER_HEIGHT,
    FOOTER_HEIGHT,
} from './types';
import { ImageResizeService } from './ImageResizeService';

/**
 * Handles all low-level image transformations using the sharp library.
 */
export class ImageProcessor {

    // ─── Public API ───────────────────────────────────────────────────────────

    public async process(
        filePath: string,
        options: ImagePlacementOptions = {},
        bounds: ContainerBounds | null = null
    ): Promise<ProcessedImage> {
        if (!fs.existsSync(filePath)) {
            throw new Error(`[ImageProcessor] File not found: ${filePath}`);
        }

        // 1. Load & normalise EXIF orientation
        const meta = await sharp(filePath).metadata();
        let naturalW = meta.width ?? PAGE_CONTENT_WIDTH;
        let naturalH = meta.height ?? Math.round(PAGE_CONTENT_WIDTH * 0.75);

        // If image has EXIF rotation (5, 6, 7, 8), the actual pixel dimensions are swapped
        if (meta.orientation && meta.orientation >= 5) {
            const temp = naturalW;
            naturalW = naturalH;
            naturalH = temp;
        }

        const mode = options.mode ?? 'original_size';
        const keepAR = options.keepAspectRatio !== false;

        // 2. Compute target dimensions using ImageResizeService
        const { width: targetW, height: targetH, scale } = ImageResizeService.calculateTargetDimensions(
            naturalW,
            naturalH,
            bounds,
            mode
        );

        // 3. Resize / crop
        const cropMode: CropMode =
            options.cropMode && options.cropMode !== 'none'
                ? options.cropMode
                : (mode === 'fill_area' || mode === 'fill_cell') ? 'center' : 'none';

        let buffer: Buffer;
        let width = targetW;
        let height = targetH;

        if (cropMode !== 'none') {
            buffer = await this.resizeWithCrop(filePath, targetW, targetH, cropMode);
        } else {
            // "Jangan ada proses resize kedua. Jangan pernah melakukan zoom pada gambar."
            // NOTE: We compress the pixel buffer (max 1200px, JPEG) to prevent huge file sizes
            // which cause Discord 413 Payload Too Large errors when users upload many photos.
            // This does NOT crop or zoom the image. It only reduces the file size.
            // The size reported to Docxtemplater will still be the mathematically exact 
            // visually scaled width/height (targetW/targetH) to perfectly fit the cell.
            buffer = await sharp(filePath)
                .rotate()
                .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
                .jpeg({ quality: 85 })
                .toBuffer();
            width = targetW;
            height = targetH;
        }

        // Signature bg removal (if signature mode)
        if (mode === 'signature') {
            buffer = await this.removeWhiteBackground(buffer);
        }

        // 4. Opacity (watermark or explicit)
        const effectiveOpacity = mode === 'watermark' ? (options.opacity ?? 0.25) : options.opacity;
        if (effectiveOpacity !== undefined && effectiveOpacity < 1) {
            buffer = await this.applyOpacity(buffer, effectiveOpacity);
        }

        // 5. Border
        if (options.border) {
            const r = await this.applyBorder(buffer, width, height, options.border);
            ({ buffer, width, height } = r);
        }

        // 6. Shadow
        if (options.shadow) {
            const r = await this.applyShadow(buffer, width, height, options.shadow);
            ({ buffer, width, height } = r);
        }

        // 7. Margin
        if (options.margin) {
            const r = await this.applyMargin(buffer, width, height, options.margin);
            ({ buffer, width, height } = r);
        }

        // Note: Alignment is now naturally handled by Word (Image engine returns exact aspect-ratio scaled dimensions).
        // Transparent padding is removed so it acts exactly like object-fit: contain without breaking Word table margins.

        // Caption
        let caption: string | undefined;
        if (options.caption === true) {
            caption = `Gambar: ${path.basename(filePath)}`;
        } else if (typeof options.caption === 'string') {
            caption = options.caption;
        }

        return { 
            buffer, 
            width, 
            height, 
            format: 'png', 
            caption,
            originalWidth: naturalW,
            originalHeight: naturalH
        };
    }

    // ─── Crop ─────────────────────────────────────────────────────────────────

    private async resizeWithCrop(
        filePath: string,
        targetW: number,
        targetH: number,
        cropMode: CropMode
    ): Promise<Buffer> {
        const posMap: Record<CropMode, string> = {
            none: 'centre',
            center: 'centre',
            top: 'top',
            bottom: 'bottom',
            left: 'left',
            right: 'right',
            smart: 'attention',
        };

        return sharp(filePath)
            .rotate()
            .resize(targetW, targetH, {
                fit: 'cover',
                position: posMap[cropMode] ?? 'centre',
            })
            .png()
            .toBuffer();
    }

    // ─── Signature BG Removal ──────────────────────────────────────────────────

    private async removeWhiteBackground(buffer: Buffer): Promise<Buffer> {
        // A naive way to remove white background by turning light pixels transparent.
        // Requires more complex operations in sharp.
        // Convert to RGBA, iterate pixels, if R>200, G>200, B>200 -> alpha 0.
        const { data, info } = await sharp(buffer)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const newData = Buffer.from(data);
        for (let i = 0; i < newData.length; i += 4) {
            const r = newData[i];
            const g = newData[i + 1];
            const b = newData[i + 2];
            if (r > 230 && g > 230 && b > 230) {
                newData[i + 3] = 0; // Transparent
            }
        }

        return sharp(newData, {
            raw: { width: info.width, height: info.height, channels: 4 },
        })
            .png()
            .toBuffer();
    }

    // ─── Opacity ──────────────────────────────────────────────────────────────

    private async applyOpacity(buffer: Buffer, opacity: number): Promise<Buffer> {
        const { data, info } = await sharp(buffer)
            .ensureAlpha()
            .raw()
            .toBuffer({ resolveWithObject: true });

        const newData = Buffer.from(data);
        for (let i = 3; i < newData.length; i += 4) {
            newData[i] = Math.round(newData[i] * opacity);
        }

        return sharp(newData, {
            raw: { width: info.width, height: info.height, channels: 4 },
        })
            .png()
            .toBuffer();
    }

    // ─── Border ───────────────────────────────────────────────────────────────

    private async applyBorder(
        buffer: Buffer,
        imgW: number,
        imgH: number,
        border: BorderOptions
    ): Promise<{ buffer: Buffer; width: number; height: number }> {
        const bw = border.width ?? 2;
        const rgb = this.hexToRgb(border.color ?? '#000000');

        const totalW = imgW + bw * 2;
        const totalH = imgH + bw * 2;

        const result = await sharp({
            create: {
                width: totalW,
                height: totalH,
                channels: 4,
                background: { r: rgb.r, g: rgb.g, b: rgb.b, alpha: 255 },
            },
        })
            .composite([{ input: buffer, left: bw, top: bw }])
            .png()
            .toBuffer();

        return { buffer: result, width: totalW, height: totalH };
    }

    // ─── Shadow ───────────────────────────────────────────────────────────────

    private async applyShadow(
        buffer: Buffer,
        imgW: number,
        imgH: number,
        shadow: ShadowOptions
    ): Promise<{ buffer: Buffer; width: number; height: number }> {
        const offsetX = shadow.offsetX ?? 4;
        const offsetY = shadow.offsetY ?? 4;
        const blur = shadow.blur ?? 4;
        const opacity = shadow.opacity ?? 0.4;
        const rgb = this.hexToRgb(shadow.color ?? '#000000');

        const padLeft = Math.max(0, -offsetX) + blur;
        const padTop = Math.max(0, -offsetY) + blur;
        const padRight = Math.max(0, offsetX) + blur;
        const padBottom = Math.max(0, offsetY) + blur;

        const totalW = imgW + padLeft + padRight;
        const totalH = imgH + padTop + padBottom;

        const shadowLayer = await sharp({
            create: {
                width: imgW,
                height: imgH,
                channels: 4,
                background: { r: rgb.r, g: rgb.g, b: rgb.b, alpha: Math.round(opacity * 255) },
            },
        })
            .blur(blur > 0 ? blur : 0.3)
            .png()
            .toBuffer();

        const result = await sharp({
            create: {
                width: totalW,
                height: totalH,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 255 }, // Or transparent
            },
        })
            .composite([
                { input: shadowLayer, left: padLeft + offsetX, top: padTop + offsetY, blend: 'over' },
                { input: buffer, left: padLeft, top: padTop, blend: 'over' },
            ])
            .png()
            .toBuffer();

        return { buffer: result, width: totalW, height: totalH };
    }

    // ─── Margin ───────────────────────────────────────────────────────────────

    private async applyMargin(
        buffer: Buffer,
        imgW: number,
        imgH: number,
        margin: MarginOptions
    ): Promise<{ buffer: Buffer; width: number; height: number }> {
        const top = margin.top ?? 0;
        const right = margin.right ?? 0;
        const bottom = margin.bottom ?? 0;
        const left = margin.left ?? 0;

        const totalW = imgW + left + right;
        const totalH = imgH + top + bottom;

        const result = await sharp({
            create: {
                width: totalW,
                height: totalH,
                channels: 4,
                background: { r: 255, g: 255, b: 255, alpha: 0 }, // Transparent margin
            },
        })
            .composite([{ input: buffer, left, top }])
            .png()
            .toBuffer();

        return { buffer: result, width: totalW, height: totalH };
    }

    // ─── Utility ──────────────────────────────────────────────────────────────

    public hexToRgb(hex: string): { r: number; g: number; b: number } {
        const clean = hex.replace('#', '').padEnd(6, '0');
        const bigint = parseInt(clean, 16);
        return {
            r: (bigint >> 16) & 255,
            g: (bigint >> 8) & 255,
            b: bigint & 255,
        };
    }
}
