import { JsonDB } from '../utils/jsonDB';

/**
 * Represents a single detected field in a template document.
 */
export interface TemplateField {
    key: string;           // Normalized key, e.g. "tanggal"
    label: string;         // Original label as found in doc, e.g. "Tanggal Pelaksanaan"
    format: string;        // Detection format: 'placeholder', 'colon', 'underline', 'dots', 'area', 'angle', 'bracket'
    isImage: boolean;      // True if this field is intended for an image/photo
    position?: number;     // Approximate position/order in document
}

/**
 * The full analysis result stored for each template.
 */
export interface TemplateAnalysis {
    templateId: string;
    analysisVersion: number;      // Increment if detection logic changes
    analyzedAt: number;           // Timestamp
    fields: TemplateField[];
    hasLegacyPlaceholders: boolean; // True if template uses {{...}} or {%...} format
    rawDocumentText?: string;     // Cached extracted text (optional, for performance)
}

export class TemplateMetadataRepository {
    private db: JsonDB<{ analyses: TemplateAnalysis[] }>;

    constructor(workspaceId?: string) {
        const dbPath = workspaceId
            ? `storage/workspaces/${workspaceId}/database/template_analysis.json`
            : 'storage/database/template_analysis.json';
        this.db = new JsonDB(dbPath);
    }

    public async init(): Promise<void> {
        await this.db.init({ analyses: [] });
    }

    public async getByTemplateId(templateId: string): Promise<TemplateAnalysis | undefined> {
        const data = await this.db.read();
        return data?.analyses.find(a => a.templateId === templateId);
    }

    public async save(analysis: TemplateAnalysis): Promise<boolean> {
        const data = await this.db.read() || { analyses: [] };
        const idx = data.analyses.findIndex(a => a.templateId === analysis.templateId);
        if (idx >= 0) {
            data.analyses[idx] = analysis;
        } else {
            data.analyses.push(analysis);
        }
        return await this.db.write(data);
    }

    public async delete(templateId: string): Promise<boolean> {
        const data = await this.db.read();
        if (!data) return false;
        const before = data.analyses.length;
        data.analyses = data.analyses.filter(a => a.templateId !== templateId);
        if (data.analyses.length === before) return false;
        return await this.db.write(data);
    }
}
