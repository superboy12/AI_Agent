import fs from 'fs';
import path from 'path';
import https from 'https';
import { config } from '../config/env';

export class FileHandler {
    constructor() {
        // Create temp directory if it doesn't exist
        if (!fs.existsSync(config.tempDir)) {
            fs.mkdirSync(config.tempDir, { recursive: true });
        }
    }

    /**
     * Downloads a file from a given URL and saves it to the temporary directory.
     * @param url The URL to download from
     * @param filename The desired filename
     * @returns The absolute path to the downloaded file
     */
    public async downloadFile(url: string, filename: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const dest = path.join(config.tempDir, filename);
            const file = fs.createWriteStream(dest);
            
            https.get(url, (response) => {
                if (response.statusCode !== 200) {
                    reject(new Error(`Failed to download file, status code: ${response.statusCode}`));
                    return;
                }
                
                response.pipe(file);
                file.on('finish', () => {
                    file.close();
                    resolve(dest);
                });
            }).on('error', (err) => {
                fs.unlink(dest, () => {});
                reject(err);
            });
        });
    }

    /**
     * Deletes a file safely
     * @param filepath The absolute path to the file to delete
     */
    public cleanupFile(filepath: string): void {
        try {
            if (fs.existsSync(filepath)) {
                fs.unlinkSync(filepath);
            }
        } catch (error) {
            console.error(`Failed to cleanup file ${filepath}:`, error);
        }
    }
}
