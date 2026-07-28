import { GoogleGenAI } from '@google/genai';
import { config } from '../../config/env';
import { TemplateField } from '../../repositories/TemplateMetadataRepository';
import { FieldDictionary } from './FieldDictionary';
import { FieldDictionaryRepository } from '../../repositories/FieldDictionaryRepository';

export interface FieldMapping {
    excelColumn: string;      // Original Excel column header
    templateField: string;    // Template field key
    templateLabel: string;    // Original template field label
    confidence: number;       // 0-100
    reason: string;           // AI explanation
}

export interface MappingResult {
    mappings: FieldMapping[];
    unmappedExcelColumns: string[];   // Columns in Excel that couldn't be mapped
    unmappedTemplateFields: string[]; // Template fields without Excel data
    lowConfidenceFields: FieldMapping[]; // mappings with confidence < threshold
}

/**
 * SemanticFieldMatcher
 *
 * Uses Gemini AI to perform semantic similarity matching between Excel column
 * headers and template field labels.
 *
 * Example:
 *   Excel "Tgl" → Template "Tanggal" (confidence: 99%)
 *   Excel "Tempat" → Template "Lokasi" (confidence: 96%)
 */
export class SemanticFieldMatcher {
    private static readonly LOW_CONFIDENCE_THRESHOLD = 70;
    private ai: GoogleGenAI;
    private dictRepo: FieldDictionaryRepository;
    private dict: FieldDictionary;

    constructor(workspaceId?: string) {
        this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
        this.dictRepo = new FieldDictionaryRepository(workspaceId);
        this.dict = FieldDictionary.getInstance();
    }

    /**
     * Initialize: load learned aliases and merge into dictionary.
     */
    public async init(): Promise<void> {
        await this.dictRepo.init();
        const learned = await this.dictRepo.getAll();
        if (learned.length > 0) {
            this.dict.mergeLearnedAliases(learned);
            console.log(`[SemanticFieldMatcher] Merged ${learned.length} learned aliases into dictionary.`);
        }
    }

    /**
     * Performs semantic matching between Excel columns and template fields.
     *
     * @param excelColumns Array of column header strings from the Excel file
     * @param templateFields Array of TemplateField objects from template analysis
     * @returns MappingResult with all mappings and confidence scores
     */
    public async match(excelColumns: string[], templateFields: TemplateField[]): Promise<MappingResult> {
        if (excelColumns.length === 0 || templateFields.length === 0) {
            return {
                mappings: [],
                unmappedExcelColumns: excelColumns,
                unmappedTemplateFields: templateFields.map(f => f.key),
                lowConfidenceFields: [],
            };
        }

        const textFields = templateFields.filter(f => !f.isImage);
        
        if (textFields.length === 0) {
            return {
                mappings: [],
                unmappedExcelColumns: excelColumns,
                unmappedTemplateFields: [],
                lowConfidenceFields: [],
            };
        }

        // ── Layer 0: Dictionary lookup (FASTEST, no API cost, confidence 100%) ──
        const dictMappings = this.dictionaryMatch(excelColumns, textFields);
        const afterDictExcel = excelColumns.filter(c => !dictMappings.find(m => m.excelColumn === c));
        const afterDictTemplate = textFields.filter(f => !dictMappings.find(m => m.templateField === f.key));

        // ── Layer 1: Rule-based matching ──────────────────────────────────────
        const ruleMappings = this.ruleBasedMatch(afterDictExcel, afterDictTemplate);
        const unmappedExcel = afterDictExcel.filter(c => !ruleMappings.find(m => m.excelColumn === c));
        const unmappedTemplate = afterDictTemplate.filter(f => !ruleMappings.find(m => m.templateField === f.key));

        // ── Layer 2: AI semantic matching ────────────────────────────────────
        let aiMappings: FieldMapping[] = [];
        if (unmappedExcel.length > 0 && unmappedTemplate.length > 0) {
            try {
                aiMappings = await this.aiMatch(unmappedExcel, unmappedTemplate);
                // Field Learning: save new AI mappings to dictionary repository
                for (const m of aiMappings) {
                    if (m.confidence >= SemanticFieldMatcher.LOW_CONFIDENCE_THRESHOLD) {
                        const canonical = this.dict.resolve(m.templateField) ?? m.templateField;
                        // Save the Excel column as a learned alias for this canonical field
                        await this.dictRepo.addAlias(canonical, m.excelColumn, 'ai_match').catch(() => {});
                    }
                }
            } catch (error: any) {
                console.error('[SemanticFieldMatcher] AI matching failed, using rule-based only:', error?.message);
            }
        }

        const allMappings = [...dictMappings, ...ruleMappings, ...aiMappings];
        const mappedExcel = new Set(allMappings.map(m => m.excelColumn));
        const mappedTemplate = new Set(allMappings.map(m => m.templateField));

        const result: MappingResult = {
            mappings: allMappings,
            unmappedExcelColumns: excelColumns.filter(c => !mappedExcel.has(c)),
            unmappedTemplateFields: textFields.map(f => f.key).filter(k => !mappedTemplate.has(k)),
            lowConfidenceFields: allMappings.filter(m => m.confidence < SemanticFieldMatcher.LOW_CONFIDENCE_THRESHOLD),
        };

        console.log('[SemanticFieldMatcher] Mapping result:', JSON.stringify(result, null, 2));
        return result;
    }

    /**
     * Layer 0: Dictionary-based matching using FieldDictionary.
     * Maps both Excel column and template field through dictionary to find canonical matches.
     * Confidence: 100% (exact dictionary lookup).
     */
    private dictionaryMatch(excelColumns: string[], templateFields: TemplateField[]): FieldMapping[] {
        const mappings: FieldMapping[] = [];
        const usedTemplate = new Set<string>();

        for (const col of excelColumns) {
            // Resolve the Excel column to a canonical field name
            const colCanonical = this.dict.resolve(col);
            if (!colCanonical) continue;

            // Find the template field that maps to the same canonical
            for (const tf of templateFields) {
                if (usedTemplate.has(tf.key)) continue;
                // The template field key is already canonicalized by PlaceholderDetectorService
                const tfCanonical = this.dict.resolve(tf.label) ?? tf.key;

                if (colCanonical === tfCanonical || colCanonical === tf.key) {
                    const displayName = this.dict.getDisplayName(colCanonical);
                    mappings.push({
                        excelColumn: col,
                        templateField: tf.key,
                        templateLabel: tf.label,
                        confidence: 100,
                        reason: `Dictionary match: "${col}" → [${displayName}] → "${tf.label}"`,
                    });
                    usedTemplate.add(tf.key);
                    break;
                }
            }
        }

        if (mappings.length > 0) {
            console.log(`[SemanticFieldMatcher] Dictionary layer matched ${mappings.length} fields.`);
        }
        return mappings;
    }

    /**
     * Rule-based matching (exact, normalized, alias).
     * No AI cost, instant response.
     */
    private ruleBasedMatch(excelColumns: string[], templateFields: TemplateField[]): FieldMapping[] {
        const mappings: FieldMapping[] = [];
        const usedTemplate = new Set<string>();

        // Normalization helper
        const norm = (s: string) => s.toLowerCase().trim()
            .replace(/[_\s-]+/g, ' ')
            .replace(/[^a-z0-9\u00C0-\u024F ]/g, '');

        // Common alias dictionary
        const aliases: Record<string, string[]> = {
            tanggal: ['tgl', 'date', 'tanggal', 'waktu', 'tgl pelaksanaan', 'tanggal pelaksanaan'],
            lokasi: ['lokasi', 'tempat', 'location', 'place', 'wilayah', 'daerah', 'kota'],
            nama: ['nama', 'name', 'nama lengkap', 'full name'],
            kegiatan: ['kegiatan', 'aktivitas', 'activity', 'pekerjaan', 'tugas'],
            deskripsi: ['deskripsi', 'description', 'uraian', 'keterangan', 'detail', 'uraian kegiatan'],
            hasil: ['hasil', 'result', 'output', 'capaian', 'hasil kegiatan'],
            kesimpulan: ['kesimpulan', 'ringkasan', 'summary', 'conclusion', 'penutup'],
            petugas: ['petugas', 'pelaksana', 'pj', 'nama petugas', 'teknisi', 'officer', 'anggota'],
            catatan: ['catatan', 'note', 'notes', 'keterangan tambahan', 'remarks'],
            kendala: ['kendala', 'hambatan', 'masalah', 'problem', 'issue'],
            foto: ['foto', 'gambar', 'image', 'photo', 'dokumentasi'],
        };

        for (const col of excelColumns) {
            const normCol = norm(col);

            for (const tf of templateFields) {
                if (usedTemplate.has(tf.key)) continue;
                const normLabel = norm(tf.label);

                // 1. Exact match (normalized)
                if (normCol === normLabel || normCol === norm(tf.key)) {
                    mappings.push({
                        excelColumn: col,
                        templateField: tf.key,
                        templateLabel: tf.label,
                        confidence: 100,
                        reason: 'Exact match',
                    });
                    usedTemplate.add(tf.key);
                    break;
                }

                // 2. Alias match
                for (const [canonical, aliasList] of Object.entries(aliases)) {
                    const colMatchesAlias = aliasList.some(a => normCol === a || normCol.includes(a) || a.includes(normCol));
                    const templateMatchesCanonical = norm(tf.key) === canonical || norm(tf.label).includes(canonical) || aliasList.some(a => norm(tf.label) === a);
                    
                    if (colMatchesAlias && templateMatchesCanonical) {
                        mappings.push({
                            excelColumn: col,
                            templateField: tf.key,
                            templateLabel: tf.label,
                            confidence: 92,
                            reason: `Alias match: "${col}" → "${canonical}"`,
                        });
                        usedTemplate.add(tf.key);
                        break;
                    }
                }

                if (usedTemplate.has(tf.key)) break;

                // 3. Substring match (partial)
                if (normLabel.includes(normCol) || normCol.includes(normLabel)) {
                    if (normCol.length >= 3 && normLabel.length >= 3) {
                        mappings.push({
                            excelColumn: col,
                            templateField: tf.key,
                            templateLabel: tf.label,
                            confidence: 80,
                            reason: `Substring match: "${col}" ⊆ "${tf.label}"`,
                        });
                        usedTemplate.add(tf.key);
                        break;
                    }
                }
            }
        }

        return mappings;
    }

    /**
     * AI-powered semantic matching for remaining unmatched fields.
     */
    private async aiMatch(excelColumns: string[], templateFields: TemplateField[]): Promise<FieldMapping[]> {
        const prompt = `Anda adalah AI yang bertugas mencocokkan kolom Excel dengan field template dokumen.

Kolom Excel yang belum terpetakan:
${excelColumns.map((c, i) => `${i + 1}. "${c}"`).join('\n')}

Field template yang belum terpetakan:
${templateFields.map((f, i) => `${i + 1}. "${f.label}" (key: "${f.key}")`).join('\n')}

Tugas Anda:
- Cocokkan setiap kolom Excel dengan field template yang paling semantis serupa
- Berikan confidence score 0-100 (100 = identik/sangat yakin, 0 = tidak ada kesamaan)
- Jika confidence < 50, JANGAN sertakan dalam mapping (anggap tidak ada pasangan)
- Satu kolom Excel hanya boleh dipasangkan dengan satu field template

Kembalikan HANYA JSON valid seperti ini (tanpa markdown, tanpa penjelasan):
{
  "mappings": [
    {
      "excelColumn": "nama kolom excel",
      "templateField": "key field template",
      "templateLabel": "label asli field template",
      "confidence": 85,
      "reason": "Alasan singkat dalam bahasa Indonesia"
    }
  ]
}`;

        try {
            const response = await this.ai.models.generateContent({
                model: 'gemini-flash-latest',
                contents: [{ role: 'user', parts: [{ text: prompt }] }],
            });

            const text = (response.text || '{}')
                .replace(/^```json\s*/i, '')
                .replace(/^```\s*/i, '')
                .replace(/```\s*$/i, '')
                .trim();

            const parsed = JSON.parse(text);
            const raw: any[] = parsed.mappings || [];

            return raw
                .filter(m => m.confidence >= 50)
                .map(m => ({
                    excelColumn: m.excelColumn,
                    templateField: m.templateField,
                    templateLabel: m.templateLabel,
                    confidence: Math.min(100, Math.max(0, Number(m.confidence))),
                    reason: m.reason || 'AI semantic match',
                }));
        } catch (error: any) {
            console.error('[SemanticFieldMatcher] AI parse error:', error?.message);
            return [];
        }
    }

    /**
     * Format mapping result as a human-readable string for bot messages.
     */
    public formatMappingReport(result: MappingResult): string {
        const lines: string[] = ['🗺️ **Hasil AI Smart Mapping:**\n'];

        if (result.mappings.length === 0) {
            lines.push('❌ Tidak ada mapping yang berhasil ditemukan.');
        } else {
            result.mappings.forEach(m => {
                const emoji = m.confidence >= 90 ? '🟢' : m.confidence >= 70 ? '🟡' : '🔴';
                lines.push(`${emoji} \`${m.excelColumn}\` → **${m.templateLabel}** _(${m.confidence}%)_`);
            });
        }

        if (result.unmappedTemplateFields.length > 0) {
            lines.push(`\n⚠️ **Field template tanpa data Excel:** ${result.unmappedTemplateFields.map(f => `\`${f}\``).join(', ')}`);
            lines.push('→ Akan diisi dengan "-" (fallback default)');
        }

        if (result.lowConfidenceFields.length > 0) {
            lines.push('\n⚠️ **Field dengan confidence rendah (<70%):**');
            result.lowConfidenceFields.forEach(m => {
                lines.push(`  • \`${m.excelColumn}\` → \`${m.templateLabel}\` (${m.confidence}%): _${m.reason}_`);
            });
        }

        return lines.join('\n');
    }

    public getLowConfidenceThreshold(): number {
        return SemanticFieldMatcher.LOW_CONFIDENCE_THRESHOLD;
    }
}
