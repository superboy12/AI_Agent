import { ContainerBounds, PlacementMode, PAGE_CONTENT_WIDTH } from './types';

export class ImageResizeService {
    /**
     * Calculates target dimensions based on the natural image size and available container bounds.
     * Used by ImageProcessor to physically resize the image before inserting.
     */
    public static calculateTargetDimensions(
        naturalW: number,
        naturalH: number,
        bounds: ContainerBounds | null,
        mode: PlacementMode
    ): { width: number; height: number; scale: number } {
        
        // If no bounds are available (e.g., inline text, not inside a table),
        // fallback to the full page width bounds.
        const defaultBounds: ContainerBounds = {
            widthPx: PAGE_CONTENT_WIDTH,
            heightPx: Math.round(PAGE_CONTENT_WIDTH * 1.414) // ~A4 height
        };
        const activeBounds = bounds || defaultBounds;

        switch (mode) {
            case 'fit_cell':
            case 'fit_inside': {
                // Algoritma dari User:
                // 1. Jika gambar lebih kecil dari area yang tersedia, gunakan ukuran asli.
                if (naturalW <= activeBounds.widthPx && naturalH <= activeBounds.heightPx) {
                    return {
                        width: naturalW,
                        height: naturalH,
                        scale: 1.0
                    };
                }

                // 2. Jika gambar lebih besar, hitung skala proporsional
                const scale = Math.min(
                    activeBounds.widthPx / naturalW,
                    activeBounds.heightPx / naturalH
                );

                return {
                    width: Math.round(naturalW * scale),
                    height: Math.round(naturalH * scale),
                    scale: scale
                };
            }
            case 'fill_cell':
            case 'fill_area': {

                const scaleW = activeBounds.widthPx / naturalW;
                const scaleH = activeBounds.heightPx / naturalH;
                const scale = Math.max(scaleW, scaleH);
                return {
                    width: activeBounds.widthPx,
                    height: activeBounds.heightPx,
                    scale
                };
            }
            case 'signature': {
                // Signature mode: Max 40-60% height of cell, centered.
                // Let's use 50% of cell height as a target.
                const targetH = Math.min(naturalH, activeBounds.heightPx * 0.5);
                const scale = targetH / naturalH;
                const targetW = Math.round(naturalW * scale);
                // Ensure it doesn't exceed width
                if (targetW > activeBounds.widthPx) {
                    const adjust = activeBounds.widthPx / targetW;
                    return {
                        width: Math.round(targetW * adjust),
                        height: Math.round(targetH * adjust),
                        scale: scale * adjust
                    };
                }
                return { width: targetW, height: targetH, scale };
            }
            case 'logo': {
                // Logo mode: Small, e.g., max 100px or 30% of cell width.
                const targetW = Math.min(naturalW, Math.min(100, activeBounds.widthPx * 0.3));
                const scale = targetW / naturalW;
                return {
                    width: targetW,
                    height: Math.round(naturalH * scale),
                    scale
                };
            }
            case 'full_width':
            case 'fit_to_width': {
                const scale = PAGE_CONTENT_WIDTH / naturalW;
                return {
                    width: PAGE_CONTENT_WIDTH,
                    height: Math.round(naturalH * scale),
                    scale
                };
            }
            case 'full_page': {
                // Standard A4 full page bleed (approx 794x1123 at 96 DPI)
                return { width: 794, height: 1123, scale: 1.0 };
            }
            case 'original_size':
            default:
                // Raw pixel dimensions, but safeguard against absolutely massive images exceeding page bounds
                if (naturalW > PAGE_CONTENT_WIDTH && mode !== 'original_size') {
                    const scale = PAGE_CONTENT_WIDTH / naturalW;
                    return {
                        width: PAGE_CONTENT_WIDTH,
                        height: Math.round(naturalH * scale),
                        scale
                    };
                }
                return { width: naturalW, height: naturalH, scale: 1.0 };
        }
    }
}
