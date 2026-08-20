import { JsonDB } from '../utils/jsonDB';

export interface UserLearningProfile {
    userId: string;
    favoriteTemplates: { [templateId: string]: number }; // Count of usage
    favoriteDateFormat?: string;
    favoriteLanguage?: string;
    favoriteWritingStyle?: string;
    favoriteImageOptions?: any;
    confidenceScores: { [key: string]: number };
}

export interface LearningStats {
    totalLearningData: number;
    topTemplate: string;
    topMapping: string;
    topPlaceholder: string;
    learningAccuracy: number;
    recommendationAccuracy: number;
}

export class LearningRepo {
    private db: JsonDB<{ profiles: UserLearningProfile[], stats: LearningStats }>;

    constructor() {
        this.db = new JsonDB('storage/database/ai_learning.json');
    }

    public async init() {
        await this.db.init({ 
            profiles: [], 
            stats: { 
                totalLearningData: 0, 
                topTemplate: '', 
                topMapping: '', 
                topPlaceholder: '', 
                learningAccuracy: 100, 
                recommendationAccuracy: 100 
            } 
        });
    }

    public async getProfile(userId: string): Promise<UserLearningProfile> {
        const data = await this.db.read();
        if (!data) return this.createEmptyProfile(userId);
        
        let profile = data.profiles.find(p => p.userId === userId);
        if (!profile) {
            profile = this.createEmptyProfile(userId);
            data.profiles.push(profile);
            await this.db.write(data);
        }
        return profile;
    }

    public async updateProfile(userId: string, profile: UserLearningProfile): Promise<void> {
        const data = await this.db.read();
        if (!data) return;
        
        const index = data.profiles.findIndex(p => p.userId === userId);
        if (index > -1) {
            data.profiles[index] = profile;
        } else {
            data.profiles.push(profile);
        }
        
        data.stats.totalLearningData += 1;
        
        // Simple top template calculation for global stats
        let highest = 0;
        let topT = '';
        for (const p of data.profiles) {
            for (const [tId, count] of Object.entries(p.favoriteTemplates)) {
                if (count > highest) {
                    highest = count;
                    topT = tId;
                }
            }
        }
        data.stats.topTemplate = topT;

        await this.db.write(data);
    }

    public async getStats(): Promise<LearningStats> {
        const data = await this.db.read();
        if (!data) return { totalLearningData: 0, topTemplate: '', topMapping: '', topPlaceholder: '', learningAccuracy: 0, recommendationAccuracy: 0 };
        return data.stats;
    }

    public async resetProfile(userId: string): Promise<void> {
        const data = await this.db.read();
        if (!data) return;
        
        data.profiles = data.profiles.filter(p => p.userId !== userId);
        await this.db.write(data);
    }

    private createEmptyProfile(userId: string): UserLearningProfile {
        return {
            userId,
            favoriteTemplates: {},
            confidenceScores: {}
        };
    }
}
