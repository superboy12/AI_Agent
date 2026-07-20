import dotenv from 'dotenv';
import path from 'path';

// Load .env file
dotenv.config();

export const config = {
    telegramToken: process.env.TELEGRAM_TOKEN || '',
    geminiApiKey: process.env.GEMINI_API_KEY || '',
    discordToken: process.env.DISCORD_TOKEN || '',
    tempDir: path.join(__dirname, '../../temp'),
};

if (!config.telegramToken) {
    console.warn("WARNING: TELEGRAM_TOKEN is not set in .env");
}

if (!config.geminiApiKey) {
    console.warn("WARNING: GEMINI_API_KEY is not set in .env");
}
