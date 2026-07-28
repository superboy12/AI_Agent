// ─────────────────────────────────────────────────────────────────────────────
// Image Engine — Shared Types & Constants
// ─────────────────────────────────────────────────────────────────────────────

/** All supported image placement modes */
export const PLACEMENT_MODES = [
    'fit_cell',       // NEW: Smart fit inside table cell (default)
    'fill_cell',      // NEW: Fill entire table cell (crop if needed)
    'signature',      // NEW: 40-60% height of cell, centered, bg removal
    'logo',           // NEW: Small, keep aspect ratio
    'original_size',  // Use raw pixel dimensions (EXIF-corrected)
    'full_width',     // Scale to fill page content width
    'full_page',      // A4 full-page bleed (794×1123 px)
    'fit_to_width',   // Scale to fill page content width (legacy)
    'fit_to_height',  // Scale to a fixed height
    'fit_inside',     // Scale to fit within a bounding box (no crop)
    'fill_area',      // Crop-fill a fixed bounding box
    'cover_page',     // Centre + fill the content area
    'header',         // Short banner strip at the top
    'footer',         // Short banner strip at the bottom
    'inline',         // Embedded inline with text flow
    'floating',       // Float left or right with text wrap
    'center',         // Centre-aligned
    'left',           // Left-aligned
    'right',          // Right-aligned
    'watermark',      // Semi-transparent, behind text (~25 % opacity)
    'auto_ai',        // AI picks the best mode automatically
] as const;

export const ALIGNMENTS = ['center', 'left', 'right', 'top', 'bottom'] as const;
export type Alignment = typeof ALIGNMENTS[number];

/** Supported crop strategies */
export const CROP_MODES = [
    'none',    // No cropping
    'center',  // Crop from the centre
    'top',     // Anchor to top
    'bottom',  // Anchor to bottom
    'left',    // Anchor to left edge
    'right',   // Anchor to right edge
    'smart',   // sharp attention-based smart crop
] as const;

/** Multi-image layout arrangements */
export const LAYOUT_TYPES = [
    'single',     // Single image
    'grid',       // Auto NxN square grid
    'gallery',    // Variable-height gallery rows
    'two_col',    // Two equal columns
    'three_col',  // Three equal columns
] as const;

export type PlacementMode = typeof PLACEMENT_MODES[number];
export type CropMode      = typeof CROP_MODES[number];
export type LayoutType    = typeof LAYOUT_TYPES[number];

// ─── Sub-option interfaces ───────────────────────────────────────────────────

export interface ResizeOptions {
    mode: 'percentage' | 'custom';
    /** e.g. 50 → 50 % of natural size */
    percentage?: number;
    /** Custom target width in px */
    width?: number;
    /** Custom target height in px */
    height?: number;
}

export interface BorderOptions {
    /** Border thickness in px (default 2) */
    width?: number;
    /** CSS hex colour, e.g. '#000000' (default) */
    color?: string;
}

export interface ShadowOptions {
    offsetX?: number;   // px right (default 4)
    offsetY?: number;   // px down  (default 4)
    blur?:    number;   // blur sigma (default 4)
    color?:   string;   // hex (default '#000000')
    opacity?: number;   // 0–1 (default 0.4)
}

export interface MarginOptions {
    top?:    number;  // px whitespace outside the image
    right?:  number;
    bottom?: number;
    left?:   number;
}

// ─── Primary options object ───────────────────────────────────────────────────

export interface ImagePlacementOptions {
    /** Placement mode (default 'original_size') */
    mode?: PlacementMode;
    /** Resize the image before placement */
    resize?: ResizeOptions;
    /** Preserve aspect ratio during resize (default true) */
    keepAspectRatio?: boolean;
    /** Crop strategy when output must hit exact dimensions */
    cropMode?: CropMode;
    layout?: LayoutType;
    alignment?: Alignment; // NEW: Alignment handling
    /** Outer whitespace around the final image */
    margin?: MarginOptions;
    /** Solid colour border framing the image */
    border?: BorderOptions;
    /** Drop-shadow effect */
    shadow?: ShadowOptions;
    /**
     * Auto-caption:
     *   true   → generate from filename
     *   string → use this literal string
     *   false  → no caption (default)
     */
    caption?: string | boolean;
    /** Bounding-box width for fit_inside / fill_area (px) */
    targetWidth?: number;
    /** Bounding-box height for fit_inside / fill_area (px) */
    targetHeight?: number;
    /** Side for floating mode */
    floatAlignment?: 'left' | 'right';
    /** Global opacity override (0–1); watermark mode defaults to 0.25 */
    opacity?: number;
}

// ─── Result type ──────────────────────────────────────────────────────────────

export interface ProcessedImage {
    buffer:   Buffer;
    width:    number;
    height:   number;
    format:   string;   // always 'png' from the engine
    caption?: string;
    /** Original dimensions if needed by renderer */
    originalWidth?: number;
    originalHeight?: number;
}

export interface ContainerBounds {
    widthPx: number;
    heightPx: number;
}

// ─── Layout config ────────────────────────────────────────────────────────────

export interface ImageLayoutConfig {
    type: LayoutType;
    /** Pixel gap between images (default 10) */
    gutter?: number;
    /** Total composite width (default 600) */
    targetWidth?: number;
    /** Outer padding around the composite (default 0) */
    padding?: number;
    /** Canvas background colour (default white) */
    backgroundColor?: { r: number; g: number; b: number };
}

// ─── Page size constants (pixels at 96 dpi, A4) ──────────────────────────────

export const PAGE_CONTENT_WIDTH  = 600;   // content area width (with margins)
export const PAGE_CONTENT_HEIGHT = 850;   // content area height approximation
export const PAGE_FULL_WIDTH     = 794;   // A4 full width
export const PAGE_FULL_HEIGHT    = 1123;  // A4 full height
export const HEADER_HEIGHT       = 80;
export const FOOTER_HEIGHT       = 80;
