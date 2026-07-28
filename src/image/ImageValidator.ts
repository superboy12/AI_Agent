import fs from 'fs';
import path from 'path';

const ALLOWED_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.gif'];
const MAX_FILE_SIZE_MB = 10;

export class ImageValidator {
    /**
     * Validates if a file is a supported image and within size limits.
     * Throws an Error if validation fails.
     */
    public static validate(filePath: string): void {
        if (!fs.existsSync(filePath)) {
            throw new Error(`[ImageValidator] File not found: ${filePath}`);
        }

        const stats = fs.statSync(filePath);
        if (stats.size === 0) {
            throw new Error(`[ImageValidator] File is empty: ${filePath}`);
        }

        if (stats.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
            throw new Error(`[ImageValidator] File size exceeds ${MAX_FILE_SIZE_MB}MB limit: ${filePath}`);
        }

        const ext = path.extname(filePath).toLowerCase();
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
            throw new Error(`[ImageValidator] Unsupported image format '${ext}'. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
        }
    }
}
