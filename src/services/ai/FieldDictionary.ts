/**
 * FieldDictionary
 *
 * Central knowledge dictionary for the AI Agent.
 * Maps canonical field names to their aliases and expected data types.
 *
 * - Aliases are matched case-insensitively and with normalized whitespace.
 * - Learned aliases (from FieldDictionaryRepository) are merged at runtime.
 * - This is a SINGLETON to avoid redundant object creation.
 *
 * ADDITIVE ONLY — does not modify any existing service.
 */

export type FieldType = 'date' | 'string' | 'paragraph' | 'number' | 'image';

export interface FieldEntry {
    canonical: string;           // The normalized canonical key, e.g. "tanggal"
    displayName: string;         // Human-readable name, e.g. "Tanggal"
    aliases: string[];           // All known aliases (lowercase, normalized)
    type: FieldType;
    description?: string;
}

/** Built-in dictionary entries */
const BUILT_IN_ENTRIES: FieldEntry[] = [
    {
        canonical: 'tanggal',
        displayName: 'Tanggal',
        type: 'date',
        description: 'Tanggal kegiatan/laporan',
        aliases: [
            'tanggal', 'tgl', 'hari', 'date', 'waktu',
            'tanggal kegiatan', 'tanggal monitoring', 'tanggal pelaksanaan',
            'tanggal laporan', 'tgl kegiatan', 'tgl pelaksanaan', 'tgl monitoring',
        ],
    },
    {
        canonical: 'nama',
        displayName: 'Nama',
        type: 'string',
        description: 'Nama petugas/pelaksana',
        aliases: [
            'nama', 'name', 'nama petugas', 'petugas', 'pegawai',
            'pelaksana', 'operator', 'pj', 'pic', 'penanggung jawab',
            'nama pelaksana', 'nama pegawai', 'nama operator',
        ],
    },
    {
        canonical: 'lokasi',
        displayName: 'Lokasi',
        type: 'string',
        description: 'Lokasi/tempat kegiatan',
        aliases: [
            'lokasi', 'tempat', 'alamat', 'register', 'blok', 'petak', 'area',
            'wilayah', 'daerah', 'kota', 'location', 'place', 'site',
            'tempat kegiatan', 'lokasi kegiatan',
        ],
    },
    {
        canonical: 'kegiatan',
        displayName: 'Kegiatan',
        type: 'string',
        description: 'Jenis/nama kegiatan',
        aliases: [
            'kegiatan', 'aktivitas', 'activity', 'pekerjaan', 'jenis kegiatan',
            'uraian kegiatan', 'tugas', 'task', 'jenis pekerjaan', 'jenis aktivitas',
        ],
    },
    {
        canonical: 'deskripsi',
        displayName: 'Deskripsi',
        type: 'paragraph',
        description: 'Deskripsi/uraian detail',
        aliases: [
            'deskripsi', 'description', 'uraian', 'keterangan', 'catatan',
            'detail', 'penjelasan', 'narasi', 'isi', 'informasi',
        ],
    },
    {
        canonical: 'hasil',
        displayName: 'Hasil',
        type: 'paragraph',
        description: 'Hasil/output kegiatan',
        aliases: [
            'hasil', 'result', 'output', 'capaian', 'hasil kegiatan',
            'hasil monitoring', 'hasil pelaksanaan', 'temuan', 'finding',
        ],
    },
    {
        canonical: 'kesimpulan',
        displayName: 'Kesimpulan',
        type: 'paragraph',
        description: 'Kesimpulan/ringkasan',
        aliases: [
            'kesimpulan', 'ringkasan', 'summary', 'simpulan', 'conclusion',
            'penutup', 'rangkuman', 'rekomendasi', 'recommendation',
        ],
    },
    {
        canonical: 'kendala',
        displayName: 'Kendala',
        type: 'paragraph',
        description: 'Kendala/hambatan yang dihadapi',
        aliases: [
            'kendala', 'hambatan', 'masalah', 'problem', 'issue',
            'tantangan', 'challenge', 'permasalahan',
        ],
    },
    {
        canonical: 'foto',
        displayName: 'Foto',
        type: 'image',
        description: 'Foto/gambar dokumentasi',
        aliases: [
            'foto', 'gambar', 'image', 'photo', 'dokumentasi', 'picture',
            'img', 'pic', 'caption', 'foto kegiatan', 'dokumentasi kegiatan',
        ],
    },
];

export class FieldDictionary {
    private static instance: FieldDictionary;
    private entries: FieldEntry[];
    /** Normalized alias → canonical map for O(1) lookup */
    private aliasMap: Map<string, string>;

    private constructor() {
        this.entries = [...BUILT_IN_ENTRIES];
        this.aliasMap = new Map();
        this.rebuildIndex();
    }

    public static getInstance(): FieldDictionary {
        if (!FieldDictionary.instance) {
            FieldDictionary.instance = new FieldDictionary();
        }
        return FieldDictionary.instance;
    }

    /** Rebuild the alias → canonical index from all entries */
    private rebuildIndex(): void {
        this.aliasMap.clear();
        for (const entry of this.entries) {
            for (const alias of entry.aliases) {
                this.aliasMap.set(this.norm(alias), entry.canonical);
            }
        }
    }

    /**
     * Resolve a raw label to its canonical field name.
     * Returns undefined if not found in dictionary.
     *
     * @example resolve("Tgl") → "tanggal"
     * @example resolve("Nama Petugas") → "nama"
     * @example resolve("Blok") → "lokasi"
     */
    public resolve(label: string): string | undefined {
        return this.aliasMap.get(this.norm(label));
    }

    /**
     * Get the expected type for a canonical field.
     * Returns 'string' as default if canonical not found.
     */
    public getType(canonical: string): FieldType {
        const entry = this.entries.find(e => e.canonical === canonical);
        return entry?.type ?? 'string';
    }

    /**
     * Get the display name for a canonical field.
     */
    public getDisplayName(canonical: string): string {
        const entry = this.entries.find(e => e.canonical === canonical);
        return entry?.displayName ?? canonical;
    }

    /**
     * Get all aliases for a canonical field.
     */
    public getAliases(canonical: string): string[] {
        const entry = this.entries.find(e => e.canonical === canonical);
        return entry?.aliases ?? [];
    }

    /**
     * Add learned aliases from FieldDictionaryRepository.
     * Called once during initialization.
     */
    public mergeLearnedAliases(learned: { canonical: string; alias: string }[]): void {
        for (const { canonical, alias } of learned) {
            const normAlias = this.norm(alias);
            if (this.aliasMap.has(normAlias)) continue; // Already known

            const entry = this.entries.find(e => e.canonical === canonical);
            if (entry && !entry.aliases.includes(normAlias)) {
                entry.aliases.push(normAlias);
            }
        }
        this.rebuildIndex();
    }

    /**
     * Check if a label is a known alias in the dictionary.
     */
    public isKnown(label: string): boolean {
        return this.aliasMap.has(this.norm(label));
    }

    /**
     * Get all canonical field names.
     */
    public getAllCanonicals(): string[] {
        return this.entries.map(e => e.canonical);
    }

    /**
     * Get the full entry for a canonical field.
     */
    public getEntry(canonical: string): FieldEntry | undefined {
        return this.entries.find(e => e.canonical === canonical);
    }

    /**
     * Normalize a label for consistent matching.
     * - Lowercase
     * - Trim
     * - Collapse whitespace
     * - Remove punctuation except spaces
     */
    public norm(label: string): string {
        return label
            .toLowerCase()
            .trim()
            .replace(/[^a-z0-9\u00C0-\u024F ]/g, ' ')
            .replace(/\s+/g, ' ')
            .trim();
    }

    /**
     * Format a value according to field type.
     * Currently handles date auto-formatting.
     */
    public formatValue(value: string, canonical: string): string {
        const type = this.getType(canonical);
        if (type === 'date') {
            return this.tryFormatDate(value);
        }
        return value;
    }

    /**
     * Try to parse and reformat a date string to "DD Bulan YYYY" (Indonesian).
     * Falls back to original string if parsing fails.
     */
    private tryFormatDate(value: string): string {
        if (!value || value === '-') return value;

        const BULAN = [
            'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
            'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
        ];

        // Already in "DD Bulan YYYY" format → return as-is
        if (/\d{1,2}\s+[A-Za-z]+\s+\d{4}/.test(value)) return value;

        // Try to parse various formats: DD/MM/YY, DD/MM/YYYY, YYYY-MM-DD, etc.
        const patterns = [
            { re: /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/, order: 'dmy' },
            { re: /^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/, order: 'ymd' },
        ];

        for (const { re, order } of patterns) {
            const m = value.match(re);
            if (!m) continue;
            let d: number, mo: number, y: number;
            if (order === 'dmy') {
                d = parseInt(m[1]);
                mo = parseInt(m[2]);
                y = parseInt(m[3]);
                if (y < 100) y += 2000;
            } else {
                y = parseInt(m[1]);
                mo = parseInt(m[2]);
                d = parseInt(m[3]);
            }
            if (mo >= 1 && mo <= 12 && d >= 1 && d <= 31) {
                return `${d} ${BULAN[mo - 1]} ${y}`;
            }
        }

        // Try JavaScript Date parsing as last resort
        try {
            const date = new Date(value);
            if (!isNaN(date.getTime())) {
                return `${date.getDate()} ${BULAN[date.getMonth()]} ${date.getFullYear()}`;
            }
        } catch (_) {}

        return value; // Return original if all parsing fails
    }
}
