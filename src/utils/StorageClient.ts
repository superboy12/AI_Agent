import axios from 'axios';
import fs from 'fs';
import FormData from 'form-data';
import path from 'path';

export class StorageClient {
    private static baseUrl = process.env.STORAGE_SERVICE_URL || 'http://localhost:3003';

    static async uploadFile(bucket: string, key: string, filePath: string): Promise<boolean> {
        try {
            const form = new FormData();
            form.append('bucket', bucket);
            form.append('key', key);
            form.append('file', fs.createReadStream(filePath));

            const response = await axios.post(`${this.baseUrl}/api/storage/upload`, form, {
                headers: {
                    ...form.getHeaders(),
                },
            });
            return response.data.success;
        } catch (error) {
            console.error('StorageClient Upload Error:', error);
            return false;
        }
    }

    static async downloadFile(bucket: string, key: string, destPath: string): Promise<boolean> {
        try {
            const response = await axios.get(`${this.baseUrl}/api/storage/download/${bucket}/${key}`, {
                responseType: 'stream'
            });
            
            const dir = path.dirname(destPath);
            if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

            const writer = fs.createWriteStream(destPath);
            response.data.pipe(writer);

            return new Promise((resolve, reject) => {
                writer.on('finish', () => resolve(true));
                writer.on('error', reject);
            });
        } catch (error) {
            console.error('StorageClient Download Error:', error);
            return false;
        }
    }

    static async deleteFile(bucket: string, key: string): Promise<boolean> {
        try {
            const response = await axios.delete(`${this.baseUrl}/api/storage/${bucket}/${key}`);
            return response.data.success;
        } catch (error) {
            console.error('StorageClient Delete Error:', error);
            return false;
        }
    }

    static async getSignedUrl(bucket: string, key: string): Promise<string | null> {
        try {
            const response = await axios.get(`${this.baseUrl}/api/storage/signed-url/${bucket}/${key}`);
            return response.data.url;
        } catch (error) {
            console.error('StorageClient GetSignedUrl Error:', error);
            return null;
        }
    }
}
