const fs = require('fs');
const path = require('path');

const storageDir = 'd:/AiAgent/services/storage-service/src';
if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir, { recursive: true });

const files = {
    'index.ts': `import express from 'express';
import dotenv from 'dotenv';
import multer from 'multer';
import { StorageController } from './controllers/StorageController';

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3003;
const upload = multer({ dest: 'temp/' });
const storageController = new StorageController();

// Routes
app.get('/health', (req, res) => res.json({ service: 'storage-service', status: 'OK' }));
app.post('/api/storage/upload', upload.single('file'), storageController.uploadFile.bind(storageController));
app.get('/api/storage/download/:bucket/:key(*)', storageController.downloadFile.bind(storageController));
app.delete('/api/storage/:bucket/:key(*)', storageController.deleteFile.bind(storageController));
app.get('/api/storage/signed-url/:bucket/:key(*)', storageController.getSignedUrl.bind(storageController));

app.listen(PORT, () => {
    console.log(\`Storage Service running on port \${PORT}\`);
});
`,
    'controllers/StorageController.ts': `import { Request, Response } from 'express';
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
`,
    'providers/StorageProviderFactory.ts': `import { IStorageProvider } from './IStorageProvider';
import { LocalStorageProvider } from './LocalStorageProvider';
import { MinIOStorageProvider } from './MinIOStorageProvider';

export class StorageProviderFactory {
    static getProvider(): IStorageProvider {
        const type = process.env.STORAGE_PROVIDER || 'local';
        
        if (type === 'minio') {
            return new MinIOStorageProvider();
        }
        
        return new LocalStorageProvider();
    }
}
`,
    'providers/IStorageProvider.ts': `import { Readable } from 'stream';

export interface IStorageProvider {
    upload(bucket: string, key: string, stream: NodeJS.ReadableStream, contentType: string): Promise<void>;
    download(bucket: string, key: string): Promise<Readable>;
    delete(bucket: string, key: string): Promise<void>;
    getSignedUrl(bucket: string, key: string, expiresInSeconds?: number): Promise<string>;
}
`,
    'providers/LocalStorageProvider.ts': `import { IStorageProvider } from './IStorageProvider';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';

export class LocalStorageProvider implements IStorageProvider {
    private basePath = path.join(process.cwd(), 'storage_data');

    constructor() {
        if (!fs.existsSync(this.basePath)) {
            fs.mkdirSync(this.basePath, { recursive: true });
        }
    }

    private getFilePath(bucket: string, key: string): string {
        const bucketPath = path.join(this.basePath, bucket);
        if (!fs.existsSync(bucketPath)) {
            fs.mkdirSync(bucketPath, { recursive: true });
        }
        // Secure path traversal
        const safeKey = path.normalize(key).replace(/^(\\.\\.[\\/\\\\])+/, '');
        return path.join(bucketPath, safeKey);
    }

    async upload(bucket: string, key: string, stream: NodeJS.ReadableStream, contentType: string): Promise<void> {
        return new Promise((resolve, reject) => {
            const filePath = this.getFilePath(bucket, key);
            const dir = path.dirname(filePath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
            
            const writeStream = fs.createWriteStream(filePath);
            stream.pipe(writeStream);
            
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });
    }

    async download(bucket: string, key: string): Promise<Readable> {
        const filePath = this.getFilePath(bucket, key);
        if (!fs.existsSync(filePath)) {
            throw new Error('File not found');
        }
        return fs.createReadStream(filePath);
    }

    async delete(bucket: string, key: string): Promise<void> {
        const filePath = this.getFilePath(bucket, key);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }

    async getSignedUrl(bucket: string, key: string, expiresInSeconds: number = 3600): Promise<string> {
        // In local mode, we don't have real signed URLs without a dedicated download service.
        // We will just return the generic download endpoint for now.
        return \`http://localhost:\${process.env.PORT || 3003}/api/storage/download/\${bucket}/\${key}\`;
    }
}
`,
    'providers/MinIOStorageProvider.ts': `import { IStorageProvider } from './IStorageProvider';
import { Readable } from 'stream';
import * as Minio from 'minio';

export class MinIOStorageProvider implements IStorageProvider {
    private client: Minio.Client;

    constructor() {
        this.client = new Minio.Client({
            endPoint: process.env.MINIO_ENDPOINT || 'localhost',
            port: parseInt(process.env.MINIO_PORT || '9000', 10),
            useSSL: process.env.MINIO_USE_SSL === 'true',
            accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
            secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin'
        });
    }

    private async ensureBucket(bucket: string) {
        const exists = await this.client.bucketExists(bucket);
        if (!exists) {
            await this.client.makeBucket(bucket, 'us-east-1');
        }
    }

    async upload(bucket: string, key: string, stream: NodeJS.ReadableStream, contentType: string): Promise<void> {
        await this.ensureBucket(bucket);
        await this.client.putObject(bucket, key, stream as Readable);
    }

    async download(bucket: string, key: string): Promise<Readable> {
        return await this.client.getObject(bucket, key);
    }

    async delete(bucket: string, key: string): Promise<void> {
        await this.client.removeObject(bucket, key);
    }

    async getSignedUrl(bucket: string, key: string, expiresInSeconds: number = 3600): Promise<string> {
        return await this.client.presignedGetObject(bucket, key, expiresInSeconds);
    }
}
`
};

for (const [filename, content] of Object.entries(files)) {
    const fullPath = path.join(storageDir, filename);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, content);
}

// Update package.json to include multer and minio
const pkgPath = 'd:/AiAgent/services/storage-service/package.json';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.dependencies.multer = '^1.4.5-lts.1';
pkg.devDependencies['@types/multer'] = '^1.4.11';
pkg.dependencies.minio = '^7.1.3';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));

console.log('Storage Service files created.');
