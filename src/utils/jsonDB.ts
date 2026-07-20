import fs from 'fs/promises';
import path from 'path';

export class JsonDB<T> {
    private filePath: string;

    constructor(filePath: string) {
        this.filePath = path.resolve(process.cwd(), filePath);
    }

    /**
     * Initializes the DB. Creates directories and the file with default content if they don't exist.
     */
    public async init(defaultData: T): Promise<void> {
        const dir = path.dirname(this.filePath);
        try {
            await fs.mkdir(dir, { recursive: true });
            try {
                await fs.access(this.filePath);
            } catch {
                await this.write(defaultData);
            }
        } catch (error) {
            console.error(`[JsonDB] Error initializing DB at ${this.filePath}:`, error);
        }
    }

    /**
     * Reads data from the JSON file.
     */
    public async read(): Promise<T | null> {
        try {
            const data = await fs.readFile(this.filePath, 'utf-8');
            return JSON.parse(data) as T;
        } catch (error) {
            console.error(`[JsonDB] Error reading DB at ${this.filePath}:`, error);
            return null;
        }
    }

    /**
     * Writes data to the JSON file.
     */
    public async write(data: T): Promise<boolean> {
        try {
            await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
            return true;
        } catch (error) {
            console.error(`[JsonDB] Error writing DB at ${this.filePath}:`, error);
            return false;
        }
    }
}
