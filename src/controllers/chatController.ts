import { Request, Response } from 'express';
import { GeminiService } from '../ai/geminiService';
import { DeepseekService } from '../ai/deepseekService';

export class ChatController {
    public handleChat = async (req: Request, res: Response) => {
        try {
            const { message, provider = 'gemini' } = req.body;
            const file = req.file;

            if (!message && !file) {
                return res.status(400).json({ error: 'Message or file is required' });
            }

            const userId = req.ip || 'web-user';
            let reply = '';

            if (provider === 'deepseek') {
                const deepseek = DeepseekService.getInstance();
                reply = await deepseek.chat(userId, message || '[Sent a file]');
            } else {
                const gemini = GeminiService.getInstance();
                if (file) {
                    reply = await gemini.chatWithFile(userId, message || '', file);
                } else {
                    reply = await gemini.chat(userId, message);
                }
            }

            res.json({ reply });
        } catch (error: any) {
            console.error('Chat error:', error);
            res.status(500).json({ error: error.message || 'Internal server error' });
        }
    };
}
