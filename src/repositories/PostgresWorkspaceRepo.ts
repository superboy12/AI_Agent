import { Workspace } from '../models/workspace';
import { prisma } from '../utils/prismaClient';

export class PostgresWorkspaceRepo {
    public async init() {
        // Prisma auto-connects, no init needed
    }

    public async getAll(): Promise<Workspace[]> {
        const workspaces = await prisma.workspace.findMany();
        return workspaces.map(w => ({
            id: w.id,
            name: w.name,
            description: w.description,
            icon: w.icon,
            color: w.color,
            isFavorite: w.isFavorite,
            createdAt: Number(w.createdAt),
            lastOpenedAt: Number(w.lastOpenedAt),
            stats: {
                documentCount: w.documentCount,
                templateCount: w.templateCount,
                chatCount: w.chatCount
            }
        }));
    }

    public async getById(id: string): Promise<Workspace | undefined> {
        const w = await prisma.workspace.findUnique({ where: { id } });
        if (!w) return undefined;
        return {
            id: w.id,
            name: w.name,
            description: w.description,
            icon: w.icon,
            color: w.color,
            isFavorite: w.isFavorite,
            createdAt: Number(w.createdAt),
            lastOpenedAt: Number(w.lastOpenedAt),
            stats: {
                documentCount: w.documentCount,
                templateCount: w.templateCount,
                chatCount: w.chatCount
            }
        };
    }

    public async add(workspace: Workspace): Promise<boolean> {
        try {
            await prisma.workspace.create({
                data: {
                    id: workspace.id,
                    name: workspace.name,
                    description: workspace.description,
                    icon: workspace.icon,
                    color: workspace.color,
                    isFavorite: workspace.isFavorite,
                    createdAt: workspace.createdAt,
                    lastOpenedAt: workspace.lastOpenedAt,
                    documentCount: workspace.stats?.documentCount || 0,
                    templateCount: workspace.stats?.templateCount || 0,
                    chatCount: workspace.stats?.chatCount || 0
                }
            });
            return true;
        } catch {
            return false;
        }
    }

    public async update(id: string, updateData: Partial<Workspace>): Promise<boolean> {
        try {
            const data: any = { ...updateData };
            if (updateData.stats) {
                data.documentCount = updateData.stats.documentCount;
                data.templateCount = updateData.stats.templateCount;
                data.chatCount = updateData.stats.chatCount;
                delete data.stats;
            }
            await prisma.workspace.update({
                where: { id },
                data
            });
            return true;
        } catch {
            return false;
        }
    }

    public async delete(id: string): Promise<boolean> {
        try {
            await prisma.workspace.delete({ where: { id } });
            return true;
        } catch {
            return false;
        }
    }
}
