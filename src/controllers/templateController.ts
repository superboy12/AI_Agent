import { Request, Response } from 'express';
import { AgentService } from '../services/agentService';
import fs from 'fs';
import path from 'path';
import { MinioStorageService } from '../services/storage/minioStorageService';

export class TemplateController {
    private storageService = new MinioStorageService();

    public async uploadTemplate(req: Request, res: Response): Promise<void> {
        try {
            if (!req.file) {
                res.status(400).json({ error: 'No file uploaded' });
                return;
            }

            const { originalname, path: tempPath, mimetype } = req.file;
            let customName = req.body.name || originalname;
            
            const originalExt = originalname.includes('.') ? originalname.substring(originalname.lastIndexOf('.')) : '';
            if (req.body.name && !req.body.name.endsWith(originalExt)) {
                customName += originalExt;
            }

            const safeName = customName.replace(/[^a-zA-Z0-9.\\-_]/g, '_');
            const id = Date.now().toString();
            const filename = `${id}_${safeName}`;
            
            // Upload to MinIO
            const objectKey = `templates/${filename}`;
            await this.storageService.uploadFile(objectKey, tempPath, mimetype);

            const stats = fs.statSync(tempPath);
            fs.unlinkSync(tempPath);
            
            const agentService = new AgentService();
            const metadata = {
                id,
                name: safeName,
                category: 'Manual Upload',
                uploadDate: Date.now(),
                sizeBytes: stats.size,
                usageCount: 0,
                isFavorite: false,
                filePath: objectKey, // Store MinIO key instead of local path
                fileType: path.extname(filename).substring(1)
            };

            await agentService.templateRepo.add(metadata);
            
            res.json({ success: true, metadata });
        } catch (error: any) {
            console.error('Error uploading template:', error);
            res.status(500).json({ error: error.message });
        }
    }

    public async deleteTemplate(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const agentService = new AgentService();
            const template = await agentService.templateRepo.getById(id);
            
            if (!template) {
                res.status(404).json({ error: 'Template not found' });
                return;
            }

            try {
                // Determine if it's a MinIO key or a local file
                if (!template.filePath.includes('/') && !template.filePath.includes('\\') || template.filePath.startsWith('templates/')) {
                    await this.storageService.deleteFile(template.filePath);
                } else if (fs.existsSync(template.filePath)) {
                    fs.unlinkSync(template.filePath);
                }
            } catch (err) {
                console.error('Failed to delete file from storage:', err);
            }

            await agentService.templateRepo.delete(id);
            res.json({ success: true });
        } catch (error: any) {
            console.error('Error deleting template:', error);
            res.status(500).json({ error: error.message });
        }
    }

    public async getTemplates(req: Request, res: Response): Promise<void> {
        try {
            const agentService = new AgentService();
            const templates = await agentService.templateRepo.getAll();
            res.json(templates);
        } catch (error: any) {
            console.error('Error fetching templates:', error);
            res.status(500).json({ error: error.message });
        }
    }
}
