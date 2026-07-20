import { JsonDB } from '../utils/jsonDB';

export interface TemplateMetadata {
    id: string;
    name: string;
    category: string;
    uploadDate: number;
    sizeBytes: number;
    usageCount: number;
    isFavorite: boolean;
    filePath: string;
}

export class TemplateRepo {
    private db: JsonDB<{ templates: TemplateMetadata[] }>;

    constructor() {
        this.db = new JsonDB('storage/database/templates.json');
    }

    public async init() {
        await this.db.init({ templates: [] });
    }

    public async getAll(): Promise<TemplateMetadata[]> {
        const data = await this.db.read();
        return data?.templates || [];
    }

    public async getById(id: string): Promise<TemplateMetadata | undefined> {
        const templates = await this.getAll();
        return templates.find(t => t.id === id || t.name.toLowerCase() === id.toLowerCase());
    }

    public async add(template: TemplateMetadata): Promise<boolean> {
        const data = await this.db.read();
        if (!data) return false;
        data.templates.push(template);
        return await this.db.write(data);
    }

    public async update(id: string, updateData: Partial<TemplateMetadata>): Promise<boolean> {
        const data = await this.db.read();
        if (!data) return false;
        
        const index = data.templates.findIndex(t => t.id === id || t.name.toLowerCase() === id.toLowerCase());
        if (index === -1) return false;

        data.templates[index] = { ...data.templates[index], ...updateData };
        return await this.db.write(data);
    }

    public async delete(id: string): Promise<boolean> {
        const data = await this.db.read();
        if (!data) return false;

        const initialLength = data.templates.length;
        data.templates = data.templates.filter(t => t.id !== id && t.name.toLowerCase() !== id.toLowerCase());
        
        if (data.templates.length === initialLength) return false;
        return await this.db.write(data);
    }

    public async incrementUsage(id: string): Promise<void> {
        const template = await this.getById(id);
        if (template) {
            await this.update(id, { usageCount: template.usageCount + 1 });
        }
    }
}
