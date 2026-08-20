import { TemplateMetadata } from './templateRepo';
import { prisma } from '../utils/prismaClient';

export class PostgresTemplateRepo {
    private workspaceId?: string;

    constructor(workspaceId?: string) {
        this.workspaceId = workspaceId;
    }

    public async init() {
        // Prisma auto-connects
    }

    public async getAll(): Promise<TemplateMetadata[]> {
        const templates = await prisma.template.findMany({
            where: {
                workspaceId: this.workspaceId || null
            }
        });
        
        return templates.map(t => ({
            id: t.id,
            name: t.name,
            category: t.category,
            uploadDate: Number(t.uploadDate),
            sizeBytes: Number(t.sizeBytes),
            usageCount: t.usageCount,
            isFavorite: t.isFavorite,
            filePath: t.filePath,
            fileType: t.fileType || undefined,
            version: t.version || 1
        }));
    }

    public async getById(id: string): Promise<TemplateMetadata | undefined> {
        const t = await prisma.template.findFirst({
            where: {
                OR: [
                    { id: id },
                    { name: { equals: id, mode: 'insensitive' } } // Fallback for name search used in bot
                ],
                workspaceId: this.workspaceId || null
            }
        });
        
        if (!t) return undefined;
        return {
            id: t.id,
            name: t.name,
            category: t.category,
            uploadDate: Number(t.uploadDate),
            sizeBytes: Number(t.sizeBytes),
            usageCount: t.usageCount,
            isFavorite: t.isFavorite,
            filePath: t.filePath,
            fileType: t.fileType || undefined,
            version: t.version || 1
        };
    }

    public async add(template: TemplateMetadata): Promise<boolean> {
        try {
            await prisma.template.create({
                data: {
                    id: template.id,
                    name: template.name,
                    category: template.category,
                    uploadDate: template.uploadDate,
                    sizeBytes: template.sizeBytes,
                    usageCount: template.usageCount,
                    isFavorite: template.isFavorite,
                    filePath: template.filePath,
                    fileType: template.fileType,
                    version: template.version,
                    workspaceId: this.workspaceId || null
                }
            });
            return true;
        } catch {
            return false;
        }
    }

    public async update(id: string, updateData: Partial<TemplateMetadata>): Promise<boolean> {
        try {
            await prisma.template.update({
                where: { id },
                data: {
                    name: updateData.name,
                    category: updateData.category,
                    uploadDate: updateData.uploadDate,
                    sizeBytes: updateData.sizeBytes,
                    usageCount: updateData.usageCount,
                    isFavorite: updateData.isFavorite,
                    filePath: updateData.filePath,
                    fileType: updateData.fileType,
                    version: updateData.version
                }
            });
            return true;
        } catch {
            return false;
        }
    }

    public async delete(id: string): Promise<boolean> {
        try {
            await prisma.template.delete({ where: { id } });
            return true;
        } catch {
            return false;
        }
    }
}
