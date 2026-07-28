import sharp from 'sharp';
import fs from 'fs';
import { ProcessedImage, ImageLayoutConfig, LayoutType, PAGE_CONTENT_WIDTH } from './types';

/**
 * Composites multiple images into a single ProcessedImage using various
 * multi-image layout strategies.
 *
 * Available layouts:
 *   single    → No-op; returns the first image processed normally
 *   two_col   → Side-by-side, equal-width columns
 *   three_col → Three equal-width columns
 *   grid      → Auto NxN square grid (images cropped to equal square cells)
 *   gallery   → Variable-height rows; images scaled to a common row height
 */
export class ImageLayoutService {

    /**
     * Entry point — delegates to the appropriate layout strategy.
     */
    public async compose(
        filePaths: string[],
        config:    ImageLayoutConfig
    ): Promise<ProcessedImage> {
        const existing = filePaths.filter(p => fs.existsSync(p));
        if (existing.length === 0) {
            throw new Error('[ImageLayoutService] No valid image files provided.');
        }

        switch (config.type) {
            case 'two_col':   return this.twoColumn(existing, config);
            case 'three_col': return this.threeColumn(existing, config);
            case 'grid':      return this.grid(existing, config);
            case 'gallery':   return this.gallery(existing, config);
            default:          return this.singleImage(existing[0]);
        }
    }

    // ─── Single (pass-through) ────────────────────────────────────────────────

    private async singleImage(filePath: string): Promise<ProcessedImage> {
        const buffer = await sharp(filePath).rotate().png().toBuffer();
        const meta   = await sharp(buffer).metadata();
        return {
            buffer,
            width:  meta.width  ?? PAGE_CONTENT_WIDTH,
            height: meta.height ?? Math.round(PAGE_CONTENT_WIDTH * 0.75),
            format: 'png',
        };
    }

    // ─── Two-column ───────────────────────────────────────────────────────────

    private async twoColumn(
        filePaths: string[],
        config:    ImageLayoutConfig
    ): Promise<ProcessedImage> {
        const totalW  = config.targetWidth ?? PAGE_CONTENT_WIDTH;
        const gutter  = config.gutter     ?? 10;
        const padding = config.padding     ?? 0;
        const colW    = Math.floor((totalW - gutter - padding * 2) / 2);

        const files = filePaths.slice(0, 2);
        const imgs  = await this.resizeToWidth(files, colW);

        const maxH   = Math.max(...imgs.map(i => i.height));
        const canvasW = totalW;
        const canvasH = maxH + padding * 2;

        const composites = imgs.map((img, idx) => ({
            input: img.buffer,
            left:  padding + idx * (colW + gutter),
            top:   padding + Math.floor((maxH - img.height) / 2),
        }));

        return this.buildCanvas(canvasW, canvasH, composites, config.backgroundColor);
    }

    // ─── Three-column ─────────────────────────────────────────────────────────

    private async threeColumn(
        filePaths: string[],
        config:    ImageLayoutConfig
    ): Promise<ProcessedImage> {
        const totalW  = config.targetWidth ?? PAGE_CONTENT_WIDTH;
        const gutter  = config.gutter     ?? 8;
        const padding = config.padding     ?? 0;
        const colW    = Math.floor((totalW - gutter * 2 - padding * 2) / 3);

        const files = filePaths.slice(0, 3);
        const imgs  = await this.resizeToWidth(files, colW);

        const maxH    = Math.max(...imgs.map(i => i.height));
        const canvasW = totalW;
        const canvasH = maxH + padding * 2;

        const composites = imgs.map((img, idx) => ({
            input: img.buffer,
            left:  padding + idx * (colW + gutter),
            top:   padding + Math.floor((maxH - img.height) / 2),
        }));

        return this.buildCanvas(canvasW, canvasH, composites, config.backgroundColor);
    }

    // ─── Grid ─────────────────────────────────────────────────────────────────

    /**
     * Arranges images in an NxN square grid where N = ceil(sqrt(count)).
     * Each cell is a square; images are cropped to fill it.
     */
    private async grid(
        filePaths: string[],
        config:    ImageLayoutConfig
    ): Promise<ProcessedImage> {
        const totalW  = config.targetWidth ?? PAGE_CONTENT_WIDTH;
        const gutter  = config.gutter     ?? 8;
        const padding = config.padding     ?? 0;
        const n       = filePaths.length;
        const cols    = Math.ceil(Math.sqrt(n));
        const rows    = Math.ceil(n / cols);
        const cellW   = Math.floor((totalW - gutter * (cols - 1) - padding * 2) / cols);

        // Crop all images to a square cell
        const imgs = await Promise.all(
            filePaths.map(fp =>
                sharp(fp)
                    .rotate()
                    .resize(cellW, cellW, { fit: 'cover', position: 'centre' })
                    .png()
                    .toBuffer()
            )
        );

        const canvasW = totalW;
        const canvasH = rows * cellW + (rows - 1) * gutter + padding * 2;

        const composites = imgs.map((buf, idx) => {
            const col = idx % cols;
            const row = Math.floor(idx / cols);
            return {
                input: buf,
                left:  padding + col * (cellW + gutter),
                top:   padding + row * (cellW + gutter),
            };
        });

        return this.buildCanvas(canvasW, canvasH, composites, config.backgroundColor);
    }

    // ─── Gallery ──────────────────────────────────────────────────────────────

    /**
     * Arranges images in rows; each row's images share a common target height.
     * Images per row auto-adjusts to fill the total width.
     */
    private async gallery(
        filePaths: string[],
        config:    ImageLayoutConfig
    ): Promise<ProcessedImage> {
        const totalW     = config.targetWidth ?? PAGE_CONTENT_WIDTH;
        const gutter     = config.gutter     ?? 8;
        const padding    = config.padding     ?? 0;
        const rowHeight  = 160; // target height per row
        const perRow     = Math.max(1, Math.floor(totalW / (rowHeight * 1.5 + gutter)));

        // Scale all images to the row height preserving aspect ratio
        const imgs = await Promise.all(
            filePaths.map(async fp => {
                const buf  = await sharp(fp).rotate().resize(null, rowHeight, { fit: 'inside' }).png().toBuffer();
                const meta = await sharp(buf).metadata();
                return { buffer: buf, width: meta.width ?? rowHeight, height: rowHeight };
            })
        );

        const rowCount = Math.ceil(imgs.length / perRow);
        const canvasH  = rowCount * (rowHeight + gutter) - gutter + padding * 2;

        const composites: { input: Buffer; left: number; top: number }[] = [];
        let currentX = padding;
        let currentY = padding;

        imgs.forEach((img, idx) => {
            if (idx > 0 && idx % perRow === 0) {
                currentX  = padding;
                currentY += rowHeight + gutter;
            }
            composites.push({ input: img.buffer, left: currentX, top: currentY });
            currentX += img.width + gutter;
        });

        return this.buildCanvas(totalW, canvasH, composites, config.backgroundColor);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    private async resizeToWidth(
        filePaths: string[],
        colW:      number
    ): Promise<Array<{ buffer: Buffer; width: number; height: number }>> {
        return Promise.all(
            filePaths.map(async fp => {
                const buf  = await sharp(fp).rotate().resize(colW, null, { fit: 'inside', withoutEnlargement: false }).png().toBuffer();
                const meta = await sharp(buf).metadata();
                return { buffer: buf, width: meta.width ?? colW, height: meta.height ?? colW };
            })
        );
    }

    private async buildCanvas(
        width:       number,
        height:      number,
        composites:  Array<{ input: Buffer; left: number; top: number }>,
        bgColor?:    { r: number; g: number; b: number }
    ): Promise<ProcessedImage> {
        const bg = bgColor ?? { r: 255, g: 255, b: 255 };

        const buffer = await sharp({
            create: {
                width,
                height,
                channels:   4,
                background: { r: bg.r, g: bg.g, b: bg.b, alpha: 255 },
            },
        })
            .composite(composites.map(c => ({ input: c.input, left: c.left, top: c.top, blend: 'over' as const })))
            .png()
            .toBuffer();

        return { buffer, width, height, format: 'png' };
    }
}
