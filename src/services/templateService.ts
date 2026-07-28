import { TemplateRepo, TemplateMetadata } from '../repositories/templateRepo';
import { TemplateStorage } from '../storage/templateStorage';
import { TemplateAnalyzerService } from './ai/TemplateAnalyzerService';
import { TemplateAnalysis } from '../repositories/TemplateMetadataRepository';
import path from 'path';

export class TemplateService {
    private repo: TemplateRepo;
    private storage: TemplateStorage;
    private analyzer: TemplateAnalyzerService;

    constructor(workspaceId?: string) {
        this.repo = new TemplateRepo(workspaceId);
        this.storage = new TemplateStorage(workspaceId);
        this.analyzer = new TemplateAnalyzerService(workspaceId);
    }

    public async init() {
        await this.repo.init();
        await this.analyzer.init();
    }

    public async saveTemplate(
        sourcePath: string,
        name: string
    ): Promise<{ metadata: TemplateMetadata; analysis: TemplateAnalysis | null }> {
        const ext = path.extname(sourcePath).toLowerCase();
        const id = Date.now().toString();
        const filename = `${id}${ext}`;
        
        const destPath = await this.storage.saveFile(sourcePath, filename);
        const sizeBytes = await this.storage.getFileSize(filename);
        
        const metadata: TemplateMetadata = {
            id,
            name,
            category: 'General',
            uploadDate: Date.now(),
            sizeBytes,
            usageCount: 0,
            isFavorite: false,
            filePath: destPath,
            fileType: ext.replace('.', ''),
            version: 1
        };

        await this.repo.add(metadata);

        // ── FEATURE 4: Auto Field Learning ──────────────────────────────────
        // Analyze the template immediately after saving so field metadata is cached.
        // Non-fatal: if analysis fails, template save still succeeds.
        let analysis: TemplateAnalysis | null = null;
        if (ext === '.docx') {
            analysis = await this.analyzer.analyze(id, destPath);
        }

        return { metadata, analysis };
    }

    public async listTemplates(): Promise<TemplateMetadata[]> {
        return await this.repo.getAll();
    }

    public async searchTemplates(query: string): Promise<TemplateMetadata[]> {
        const all = await this.listTemplates();
        const q = query.toLowerCase();
        return all.filter(t => t.name.toLowerCase().includes(q));
    }

    public async getTemplate(idOrName: string): Promise<TemplateMetadata | undefined> {
        return await this.repo.getById(idOrName);
    }

    public async deleteTemplate(idOrName: string): Promise<boolean> {
        const template = await this.getTemplate(idOrName);
        if (!template) return false;

        const filename = path.basename(template.filePath);
        await this.storage.deleteFile(filename);
        return await this.repo.delete(template.id);
    }

    public async renameTemplate(idOrName: string, newName: string): Promise<boolean> {
        const template = await this.getTemplate(idOrName);
        if (!template) return false;
        return await this.repo.update(template.id, { name: newName });
    }

    public async toggleFavorite(idOrName: string): Promise<boolean> {
        const template = await this.getTemplate(idOrName);
        if (!template) return false;
        return await this.repo.update(template.id, { isFavorite: !template.isFavorite });
    }

    public async duplicateTemplate(idOrName: string): Promise<TemplateMetadata | null> {
        const template = await this.getTemplate(idOrName);
        if (!template) return null;

        const ext = path.extname(template.filePath);
        const newId = Date.now().toString();
        const newFilename = `${newId}${ext}`;
        const sourceFilename = path.basename(template.filePath);

        const destPath = await this.storage.duplicateFile(sourceFilename, newFilename);
        const sizeBytes = await this.storage.getFileSize(newFilename);

        const newMetadata: TemplateMetadata = {
            id: newId,
            name: `${template.name} (Copy)`,
            category: template.category,
            uploadDate: Date.now(),
            sizeBytes,
            usageCount: 0,
            isFavorite: false,
            filePath: destPath,
            fileType: template.fileType,
            version: 1
        };

        await this.repo.add(newMetadata);
        return newMetadata;
    }
    
    public async incrementUsage(id: string): Promise<void> {
        await this.repo.incrementUsage(id);
    }
}
