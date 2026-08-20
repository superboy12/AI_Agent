import { IStorageProvider } from './IStorageProvider';
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
