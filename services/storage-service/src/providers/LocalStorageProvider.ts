import { IStorageProvider } from './IStorageProvider';
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
        const safeKey = path.normalize(key).replace(/^(\.\.[\/\\])+/, '');
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
        return `http://localhost:${process.env.PORT || 3003}/api/storage/download/${bucket}/${key}`;
    }
}
