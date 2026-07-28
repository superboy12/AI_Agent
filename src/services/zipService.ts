import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';

export class ZipService {
    /**
     * Compresses a folder and its contents into a ZIP file.
     * @param sourceFolder The folder to compress
     * @param zipFilePath The output path for the ZIP file
     */
    public async compressFolder(sourceFolder: string, zipFilePath: string): Promise<boolean> {
        return new Promise((resolve, reject) => {
            try {
                if (!fs.existsSync(sourceFolder)) {
                    throw new Error(`Folder not found: ${sourceFolder}`);
                }

                const zip = new AdmZip();
                zip.addLocalFolder(sourceFolder);
                
                // Write zip file to disk
                zip.writeZip(zipFilePath, (err) => {
                    if (err) {
                        console.error('Failed to write zip file:', err);
                        reject(err);
                    } else {
                        resolve(true);
                    }
                });
            } catch (error) {
                console.error('Error during compression:', error);
                reject(error);
            }
        });
    }

    /**
     * Helper to get zip size
     */
    public getZipSize(zipFilePath: string): number {
        if (fs.existsSync(zipFilePath)) {
            const stats = fs.statSync(zipFilePath);
            return stats.size;
        }
        return 0;
    }
}
