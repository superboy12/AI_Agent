import { Readable } from 'stream';

export interface IStorageProvider {
    upload(bucket: string, key: string, stream: NodeJS.ReadableStream, contentType: string): Promise<void>;
    download(bucket: string, key: string): Promise<Readable>;
    delete(bucket: string, key: string): Promise<void>;
    getSignedUrl(bucket: string, key: string, expiresInSeconds?: number): Promise<string>;
}
