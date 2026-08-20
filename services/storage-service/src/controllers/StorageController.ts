import { Request, Response } from 'express';
import { StorageProviderFactory } from '../providers/StorageProviderFactory';
import fs from 'fs';

export class StorageController {
    private provider = StorageProviderFactory.getProvider();

    async uploadFile(req: Request, res: Response): Promise<void> {
        try {
            if (!req.file) {
                res.status(400).json({ error: 'No file provided' });
                return;
            }
            
            const { bucket, key } = req.body;
            if (!bucket || !key) {
                res.status(400).json({ error: 'bucket and key are required' });
                return;
            }

            const filePath = req.file.path;
            const fileStream = fs.createReadStream(filePath);
            
            await this.provider.upload(bucket, key, fileStream, req.file.mimetype);
            
            // Clean up temp file
            fs.unlinkSync(filePath);

            res.json({ success: true, bucket, key });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Upload failed' });
        }
    }

    async downloadFile(req: Request, res: Response): Promise<void> {
        try {
            const { bucket, key } = req.params;
            const stream = await this.provider.download(bucket, key);
            stream.pipe(res);
        } catch (error) {
            console.error(error);
            res.status(404).json({ error: 'File not found' });
        }
    }

    async deleteFile(req: Request, res: Response): Promise<void> {
        try {
            const { bucket, key } = req.params;
            await this.provider.delete(bucket, key);
            res.json({ success: true });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Delete failed' });
        }
    }

    async getSignedUrl(req: Request, res: Response): Promise<void> {
        try {
            const { bucket, key } = req.params;
            const url = await this.provider.getSignedUrl(bucket, key);
            res.json({ url });
        } catch (error) {
            console.error(error);
            res.status(500).json({ error: 'Failed to generate signed url' });
        }
    }
}
