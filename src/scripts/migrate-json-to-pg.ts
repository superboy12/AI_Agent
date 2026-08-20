import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../utils/prismaClient';

async function migrate() {
    console.log('Starting Migration from JSON to PostgreSQL...');

    // Migrate Workspaces
    const workspacePath = path.join(process.cwd(), 'storage/database/workspaces.json');
    try {
        const data = await fs.readFile(workspacePath, 'utf-8');
        const workspacesData = JSON.parse(data).workspaces || [];
        
        for (const w of workspacesData) {
            await prisma.workspace.upsert({
                where: { id: w.id },
                update: {},
                create: {
                    id: w.id,
                    name: w.name,
                    description: w.description || '',
                    icon: w.icon || 'folder',
                    color: w.color || '#000000',
                    isFavorite: w.isFavorite || false,
                    createdAt: w.createdAt,
                    lastOpenedAt: w.lastOpenedAt,
                    documentCount: w.stats?.documentCount || 0,
                    templateCount: w.stats?.templateCount || 0,
                    chatCount: w.stats?.chatCount || 0
                }
            });
            console.log(`Migrated Workspace: ${w.name}`);
        }
    } catch (e: any) {
        console.log('Workspaces JSON not found or empty:', e.message);
    }

    // Migrate Global Templates
    const globalTemplatePath = path.join(process.cwd(), 'storage/database/templates.json');
    try {
        const data = await fs.readFile(globalTemplatePath, 'utf-8');
        const templatesData = JSON.parse(data).templates || [];
        
        for (const t of templatesData) {
            await prisma.template.upsert({
                where: { id: t.id },
                update: {},
                create: {
                    id: t.id,
                    name: t.name,
                    category: t.category,
                    uploadDate: t.uploadDate,
                    sizeBytes: t.sizeBytes,
                    usageCount: t.usageCount,
                    isFavorite: t.isFavorite || false,
                    filePath: t.filePath,
                    fileType: t.fileType,
                    version: t.version || 1
                }
            });
            console.log(`Migrated Global Template: ${t.name}`);
        }
    } catch (e: any) {
        console.log('Global Templates JSON not found or empty:', e.message);
    }

    console.log('Migration Completed!');
}

migrate()
    .catch(e => console.error(e))
    .finally(async () => {
        await prisma.$disconnect();
    });
