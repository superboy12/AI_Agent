import { TemplateMetadata } from '../repositories/templateRepo';

export type ActiveTemplateState = 
    | { type: 'registry'; metadata: TemplateMetadata }
    | { type: 'temporary'; path: string; name: string };

export class TemplateManager {
    private static instance: TemplateManager;
    private activeTemplates: Map<string, ActiveTemplateState>;

    private constructor() {
        this.activeTemplates = new Map();
    }

    public static getInstance(): TemplateManager {
        if (!TemplateManager.instance) {
            TemplateManager.instance = new TemplateManager();
        }
        return TemplateManager.instance;
    }

    public setActiveTemplate(userId: string, state: ActiveTemplateState): void {
        this.activeTemplates.set(userId, state);
    }

    public getActiveTemplate(userId: string): ActiveTemplateState | undefined {
        return this.activeTemplates.get(userId);
    }

    public clearActiveTemplate(userId: string): void {
        this.activeTemplates.delete(userId);
    }
}
