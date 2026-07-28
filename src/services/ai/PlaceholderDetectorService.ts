import { TemplateField } from '../../repositories/TemplateMetadataRepository';
import { FieldDictionary } from './FieldDictionary';

/**
 * PlaceholderDetectorService
 *
 * Detects fillable fields in a DOCX template from multiple formats:
 *  1. {{key}} / {key}           — classic double/single curly brace placeholder
 *  2. <<key>>                   — angle bracket placeholder
 *  3. [key]                     — square bracket placeholder
 *  4. Label :                   — label followed by colon, value on same or next line
 *  5. Label __________          — label followed by underscores
 *  6. Label ............        — label followed by dots
 *  7. Standalone label + blank  — a heading-like line followed by empty/dot lines
 *
 * Image fields are identified by keywords: gambar, foto, image, img, pic, dokumentasi, photo
 * 
 * All detection is ADDITIVE — no existing functionality is changed.
 */
export class PlaceholderDetectorService {

    private static readonly IMAGE_KEYWORDS = /gambar|foto|image|img|pic|dokumentasi|photo|caption/i;

    /**
     * Main entry point. Detects all fillable fields from extracted document text.
     * @param text Raw text extracted from the DOCX (via mammoth)
     * @returns Array of detected TemplateField objects, deduplicated and ordered
     */
    public detect(text: string): TemplateField[] {
        const fields: TemplateField[] = [];
        const seenKeys = new Set<string>();

        const addField = (field: TemplateField) => {
            if (!seenKeys.has(field.key)) {
                seenKeys.add(field.key);
                fields.push(field);
            }
        };

        // Run all detectors in priority order
        this.detectCurlyBrace(text).forEach(addField);
        this.detectAngleBracket(text).forEach(addField);
        this.detectSquareBracket(text).forEach(addField);
        this.detectColonFormat(text).forEach(addField);
        this.detectEqualsFormat(text).forEach(addField);   // NEW: "Label = value"
        this.detectUnderlineFormat(text).forEach(addField);
        this.detectDotsFormat(text).forEach(addField);
        this.detectAreaFormat(text).forEach(addField);

        return fields;
    }

    /**
     * Check if the template already has legacy {{placeholders}}
     */
    public hasLegacyPlaceholders(text: string): boolean {
        return /\{\{?\w+\}?\}/.test(text) || /\{%\w+\}/.test(text);
    }

    // ──────────────────────────────────────────────────────────────────────
    // DETECTOR 1: {{key}} or {key} (legacy format — detected for metadata)
    // ──────────────────────────────────────────────────────────────────────
    private detectCurlyBrace(text: string): TemplateField[] {
        const fields: TemplateField[] = [];
        // Match {{key}} or {key} but NOT {%key} (image placeholders)
        const regex = /\{\{?(?!%)(\w+)\}?\}/g;
        let m: RegExpExecArray | null;
        let pos = 0;
        while ((m = regex.exec(text)) !== null) {
            const raw = m[1];
            const key = this.normalize(raw);
            fields.push({
                key,
                label: raw,
                format: 'placeholder',
                isImage: PlaceholderDetectorService.IMAGE_KEYWORDS.test(raw),
                position: pos++,
            });
        }
        return fields;
    }

    // ──────────────────────────────────────────────────────────────────────
    // DETECTOR 2: <<key>>
    // ──────────────────────────────────────────────────────────────────────
    private detectAngleBracket(text: string): TemplateField[] {
        const fields: TemplateField[] = [];
        const regex = /<<(\w[\w\s]*)>>/g;
        let m: RegExpExecArray | null;
        let pos = 100;
        while ((m = regex.exec(text)) !== null) {
            const raw = m[1].trim();
            const key = this.normalize(raw);
            fields.push({
                key,
                label: raw,
                format: 'angle',
                isImage: PlaceholderDetectorService.IMAGE_KEYWORDS.test(raw),
                position: pos++,
            });
        }
        return fields;
    }

    // ──────────────────────────────────────────────────────────────────────
    // DETECTOR 3: [key]
    // ──────────────────────────────────────────────────────────────────────
    private detectSquareBracket(text: string): TemplateField[] {
        const fields: TemplateField[] = [];
        // Avoid matching very long square bracket content (likely actual text)
        const regex = /\[([A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F\s]{0,40})\]/g;
        let m: RegExpExecArray | null;
        let pos = 200;
        while ((m = regex.exec(text)) !== null) {
            const raw = m[1].trim();
            const key = this.normalize(raw);
            if (!key) continue;
            fields.push({
                key,
                label: raw,
                format: 'bracket',
                isImage: PlaceholderDetectorService.IMAGE_KEYWORDS.test(raw),
                position: pos++,
            });
        }
        return fields;
    }

    // ──────────────────────────────────────────────────────────────────────
    // DETECTOR 4: "Label :" or "Label:" pattern
    // ──────────────────────────────────────────────────────────────────────
    private detectColonFormat(text: string): TemplateField[] {
        const fields: TemplateField[] = [];
        const lines = text.split(/\r?\n/);
        let pos = 300;
        for (const line of lines) {
            // Match: "Some Label :" or "Some Label:" at beginning of line
            // Label must be 2-40 chars, no numbers-only labels
            const m = line.match(/^\s*([A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F\s/()]{1,40}?)\s*:\s*(.{0,30})?$/);
            if (!m) continue;
            const label = m[1].trim();
            const value = (m[2] || '').trim();
            // Skip if the value part has many words (it's already filled)
            if (value.split(/\s+/).length > 4) continue;
            // Skip common non-field patterns
            if (this.isCommonNonField(label)) continue;
            const key = this.resolveKey(label);
            if (!key || key.length < 2) continue;
            fields.push({
                key,
                label,
                format: 'colon',
                isImage: PlaceholderDetectorService.IMAGE_KEYWORDS.test(label),
                position: pos++,
            });
        }
        return fields;
    }

    // ──────────────────────────────────────────────────────────────────────
    // DETECTOR 4b: "Label = value" pattern  [NEW]
    // ──────────────────────────────────────────────────────────────────────
    private detectEqualsFormat(text: string): TemplateField[] {
        const fields: TemplateField[] = [];
        const lines = text.split(/\r?\n/);
        let pos = 350;
        for (const line of lines) {
            // Match: "Some Label = " with empty or short value after
            const m = line.match(/^\s*([A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F\s/()]{1,40}?)\s*=\s*(.{0,30})?$/);
            if (!m) continue;
            const label = m[1].trim();
            const value = (m[2] || '').trim();
            // Skip if the value part has many words (it's already filled)
            if (value.split(/\s+/).length > 4) continue;
            if (this.isCommonNonField(label)) continue;
            const key = this.resolveKey(label);
            if (!key || key.length < 2) continue;
            fields.push({
                key,
                label,
                format: 'colon',  // treat same as colon for downstream processing
                isImage: PlaceholderDetectorService.IMAGE_KEYWORDS.test(label),
                position: pos++,
            });
        }
        return fields;
    }

    // ──────────────────────────────────────────────────────────────────────
    // DETECTOR 5: "Label _____" pattern
    // ──────────────────────────────────────────────────────────────────────
    private detectUnderlineFormat(text: string): TemplateField[] {
        const fields: TemplateField[] = [];
        const lines = text.split(/\r?\n/);
        let pos = 400;
        for (const line of lines) {
            const m = line.match(/^\s*([A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F\s/()]{1,40}?)\s*_{3,}\s*$/);
            if (!m) continue;
            const label = m[1].trim();
            if (this.isCommonNonField(label)) continue;
            const key = this.normalize(label);
            if (!key || key.length < 2) continue;
            fields.push({
                key,
                label,
                format: 'underline',
                isImage: PlaceholderDetectorService.IMAGE_KEYWORDS.test(label),
                position: pos++,
            });
        }
        return fields;
    }

    // ──────────────────────────────────────────────────────────────────────
    // DETECTOR 6: "Label ........." pattern
    // ──────────────────────────────────────────────────────────────────────
    private detectDotsFormat(text: string): TemplateField[] {
        const fields: TemplateField[] = [];
        const lines = text.split(/\r?\n/);
        let pos = 500;
        for (const line of lines) {
            const m = line.match(/^\s*([A-Za-z\u00C0-\u024F][A-Za-z\u00C0-\u024F\s/()]{1,40}?)\s*\.{3,}\s*$/);
            if (!m) continue;
            const label = m[1].trim();
            if (this.isCommonNonField(label)) continue;
            const key = this.normalize(label);
            if (!key || key.length < 2) continue;
            fields.push({
                key,
                label,
                format: 'dots',
                isImage: PlaceholderDetectorService.IMAGE_KEYWORDS.test(label),
                position: pos++,
            });
        }
        return fields;
    }

    // ──────────────────────────────────────────────────────────────────────
    // DETECTOR 7: Standalone label followed by blank line or dots-only line
    //             (Free-form area: "Deskripsi\n\n........\n........")
    // ──────────────────────────────────────────────────────────────────────
    private detectAreaFormat(text: string): TemplateField[] {
        const fields: TemplateField[] = [];
        const lines = text.split(/\r?\n/);
        let pos = 600;
        for (let i = 0; i < lines.length - 1; i++) {
            const line = lines[i].trim();
            const nextLine = lines[i + 1]?.trim() || '';

            // A potential area label: short line (2-40 chars), no colon, no numbers
            if (!line || line.length < 2 || line.length > 40) continue;
            if (!/^[A-Za-z\u00C0-\u024F]/.test(line)) continue;
            if (this.isCommonNonField(line)) continue;
            if (/[:_.]/.test(line)) continue; // Already caught by other detectors
            if (/\d/.test(line)) continue; // Skip lines with numbers

            // Next line must be empty or dots-only
            const isAreaFollower = nextLine === '' || /^\.{3,}$/.test(nextLine) || /^_{3,}$/.test(nextLine);
            if (!isAreaFollower) continue;

            const key = this.normalize(line);
            if (!key || key.length < 2) continue;

            fields.push({
                key,
                label: line,
                format: 'area',
                isImage: PlaceholderDetectorService.IMAGE_KEYWORDS.test(line),
                position: pos++,
            });
        }
        return fields;
    }

    // ──────────────────────────────────────────────────────────────────────
    // HELPERS
    // ──────────────────────────────────────────────────────────────────────

    /**
     * Resolve a label to a key, using FieldDictionary for canonical mapping.
     * Falls back to normalize() if label not in dictionary.
     * "Tgl" → "tanggal", "Nama Petugas" → "nama", "Blok" → "lokasi"
     */
    private resolveKey(label: string): string {
        const dict = FieldDictionary.getInstance();
        const canonical = dict.resolve(label);
        return canonical ?? this.normalize(label);
    }

    /**
     * Normalize a label string to a clean snake_case key.
     * "Tanggal Pelaksanaan" → "tanggal_pelaksanaan"
     */
    private normalize(label: string): string {
        return label
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\u00C0-\u024F\s]/g, '')
            .trim()
            .replace(/\s+/g, '_');
    }

    /**
     * Skip common words/phrases that are not fillable fields.
     */
    private isCommonNonField(label: string): boolean {
        const skip = [
            'dan', 'atau', 'yang', 'dengan', 'untuk', 'pada', 'dari', 'ke',
            'no', 'nomor', 'hal', 'perihal', 'lampiran', 'kepada', 'yth',
            'catatan', 'keterangan', 'tanda tangan', 'ttd', 'mengetahui',
            'menyetujui', 'dibuat oleh', 'diperiksa oleh', 'disetujui oleh',
        ];
        const lower = label.toLowerCase().trim();
        return skip.includes(lower) || lower.length <= 1;
    }
}
