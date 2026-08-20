import { IStorageProvider } from './IStorageProvider';
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
