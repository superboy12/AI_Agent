import { JsonDB } from '../utils/jsonDB';

export interface AppSettings {
    geminiApiKey: string;
    outputFolder: string;
    theme: string;
    language: string;
    autoSave: boolean;
    autoDeleteTempFiles: boolean;
    defaultTemplateFolder: string;
}

const DEFAULT_SETTINGS: AppSettings = {
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    outputFolder: 'storage/history/',
    theme: 'light',
    language: 'id',
    autoSave: true,
    autoDeleteTempFiles: false,
    defaultTemplateFolder: 'storage/templates/'
};

export class SettingsRepo {
    private db: JsonDB<AppSettings>;

    constructor() {
        this.db = new JsonDB('storage/config/settings.json');
    }

    public async init() {
        await this.db.init(DEFAULT_SETTINGS);
    }

    public async get(): Promise<AppSettings> {
        const data = await this.db.read();
        return data || DEFAULT_SETTINGS;
    }

    public async update(updates: Partial<AppSettings>): Promise<boolean> {
        const current = await this.get();
        const newData = { ...current, ...updates };
        return await this.db.write(newData);
    }
}
