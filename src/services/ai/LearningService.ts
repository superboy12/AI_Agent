import { LearningRepo, UserLearningProfile, LearningStats } from '../../repositories/learningRepo';

export class LearningService {
    private repo: LearningRepo;

    constructor() {
        this.repo = new LearningRepo();
        this.repo.init();
    }

    public async recordUsage(
        userId: string, 
        templateName: string, 
        mappingResult: any,
        imageOptions?: any
    ): Promise<void> {
        const profile = await this.repo.getProfile(userId);
        
        // Update favorite templates
        if (!profile.favoriteTemplates[templateName]) {
            profile.favoriteTemplates[templateName] = 0;
        }
        profile.favoriteTemplates[templateName] += 1;

        // Calculate confidence score for this template
        let totalTemplateUsages = 0;
        for (const count of Object.values(profile.favoriteTemplates)) {
            totalTemplateUsages += count;
        }

        const templateConfidence = (profile.favoriteTemplates[templateName] / totalTemplateUsages) * 100;
        profile.confidenceScores[`template_${templateName}`] = templateConfidence;

        // Record Image options preference if present
        if (imageOptions) {
            profile.favoriteImageOptions = imageOptions;
            profile.confidenceScores['imageOptions'] = (profile.confidenceScores['imageOptions'] || 0) + 5;
            if (profile.confidenceScores['imageOptions'] > 100) profile.confidenceScores['imageOptions'] = 100;
        }

        // Save profile
        await this.repo.updateProfile(userId, profile);
    }

    public async getRecommendation(userId: string): Promise<string | null> {
        const profile = await this.repo.getProfile(userId);
        
        let highestConfidence = 0;
        let recommendedTemplate = null;

        for (const [key, score] of Object.entries(profile.confidenceScores)) {
            if (key.startsWith('template_') && score >= 90) { // 90% confidence score
                if (score > highestConfidence) {
                    highestConfidence = score;
                    recommendedTemplate = key.replace('template_', '');
                }
            }
        }

        return recommendedTemplate;
    }

    public async getProfile(userId: string): Promise<UserLearningProfile> {
        return await this.repo.getProfile(userId);
    }

    public async getStats(): Promise<LearningStats> {
        return await this.repo.getStats();
    }

    public async resetLearning(userId: string): Promise<void> {
        await this.repo.resetProfile(userId);
    }
}

export const learningService = new LearningService();
