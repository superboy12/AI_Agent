import { TelegramBot } from './telegram/bot';
import { DiscordBot } from './discord/bot';
import { ApiServer } from './api/server';
import { config } from './config/env';

function main() {
    console.log("Starting AI Agent Document Generator...");
    
    if (!config.geminiApiKey) {
        console.error("FATAL ERROR: Please set GEMINI_API_KEY in your .env file.");
        process.exit(1);
    }

    if (!config.telegramToken && !config.discordToken) {
        console.error("FATAL ERROR: You must provide either TELEGRAM_TOKEN or DISCORD_TOKEN in your .env file.");
        process.exit(1);
    }

    try {
        if (config.telegramToken) {
            const telegramBot = new TelegramBot();
            telegramBot.start();
            console.log("Telegram bot initialized.");
        }

        if (config.discordToken) {
            const discordBot = new DiscordBot();
            discordBot.start();
            console.log("Discord bot initialized.");
        }

        // Start API Server
        const apiServer = new ApiServer();
        apiServer.start();
    } catch (error) {
        console.error("Failed to start the application:", error);
        process.exit(1);
    }
}

main();
