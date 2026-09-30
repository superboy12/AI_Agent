import { GoogleGenAI } from '@google/genai';
import { config } from '../config/env';

/**
 * GeminiRouter — Multi-Key × Multi-Model Router
 *
 * Strategy:
 *  1. Requests are distributed round-robin across all available API keys.
 *  2. On 503 (overload) → immediately try next key (same model).
 *  3. If all keys fail for a model → move to next model in chain.
 *  4. On 404 (model not found) → skip to next model immediately.
 *  5. Cycle repeats until a response succeeds or all combinations exhausted.
 */
export class GeminiRouter {
    private readonly clients: GoogleGenAI[];
    private roundRobinIndex: number = 0;

    private readonly MODEL_CHAIN: string[] = [
        'gemini-3.8-flash',
        'gemini-3.7-flash',
        'gemini-3.6-flash',
        'gemini-3.5-flash',
        'gemini-3.4-flash',
        'gemini-3.3-flash',
        'gemini-3.2-flash',
        'gemini-3.1-flash',
        'gemini-3.0-flash',
        'gemini-2.5-flash',
        'gemini-2.5-flash-lite',
        'gemini-2.0-flash',
        'gemini-2.0-flash-lite',
        'gemini-1.5-flash',
        'gemini-1.5-flash-8b',
    ];

    constructor() {
        const keys = config.geminiApiKeys;
        if (keys.length === 0) throw new Error('No Gemini API keys configured.');
        this.clients = keys.map(k => new GoogleGenAI({ apiKey: k }));
        console.log(`[GeminiRouter] Initialized with ${this.clients.length} key(s) × ${this.MODEL_CHAIN.length} model(s) = ${this.clients.length * this.MODEL_CHAIN.length} combinations.`);
    }

    /** Pick next client in round-robin order */
    private nextClient(): { client: GoogleGenAI; keyIndex: number } {
        const keyIndex = this.roundRobinIndex;
        this.roundRobinIndex = (this.roundRobinIndex + 1) % this.clients.length;
        return { client: this.clients[keyIndex], keyIndex };
    }

    private isOverloaded(error: any): boolean {
        return (
            error?.status === 503 ||
            error?.message?.includes('503') ||
            error?.message?.includes('UNAVAILABLE') ||
            error?.message?.includes('high demand')
        );
    }

    private isNotFound(error: any): boolean {
        return (
            error?.status === 404 ||
            error?.message?.includes('404') ||
            error?.message?.includes('NOT_FOUND') ||
            error?.message?.includes('no longer available')
        );
    }

    /**
     * Generate content using the router.
     * Tries all key × model combinations until one succeeds.
     */
    public async generateContent(contents: any[]): Promise<string> {
        let lastError: any;
        const startKeyIndex = this.roundRobinIndex;

        for (const model of this.MODEL_CHAIN) {
            // Try each key for this model (starting from current round-robin position)
            for (let attempt = 0; attempt < this.clients.length; attempt++) {
                const keyIndex = (startKeyIndex + attempt) % this.clients.length;
                const client = this.clients[keyIndex];

                try {
                    console.log(`[GeminiRouter] Key[${keyIndex + 1}/${this.clients.length}] × Model[${model}]`);
                    const response = await client.models.generateContent({ model, contents });
                    // Advance round-robin for next request
                    this.roundRobinIndex = (keyIndex + 1) % this.clients.length;
                    return response.text ?? '';
                } catch (error: any) {
                    lastError = error;
                    if (this.isNotFound(error)) {
                        console.warn(`[GeminiRouter] Model ${model} not found, skipping model.`);
                        break; // Skip to next model
                    }
                    if (this.isOverloaded(error)) {
                        console.warn(`[GeminiRouter] Key[${keyIndex + 1}] + Model[${model}] overloaded, trying next key...`);
                        continue; // Try next key
                    }
                    // Other errors (auth, quota exhausted, etc.) — still try next key
                    console.warn(`[GeminiRouter] Key[${keyIndex + 1}] error: ${error?.message}, trying next...`);
                    continue;
                }
            }
        }

        const total = this.clients.length * this.MODEL_CHAIN.length;
        console.error(`[GeminiRouter] All ${total} combinations failed. Last error:`, lastError?.message);
        throw new Error(`Semua model Gemini sedang sibuk atau tidak tersedia. Coba lagi nanti.`);
    }

    /**
     * Generate JSON content (auto-strips markdown fences).
     */
    public async generateJSON(contents: any[]): Promise<string> {
        const raw = await this.generateContent(contents);
        return raw
            .replace(/^```json\s*/i, '')
            .replace(/^```\s*/i, '')
            .replace(/```\s*$/i, '')
            .trim();
    }
}

// Singleton
let _router: GeminiRouter | null = null;
export function getGeminiRouter(): GeminiRouter {
    if (!_router) _router = new GeminiRouter();
    return _router;
}
