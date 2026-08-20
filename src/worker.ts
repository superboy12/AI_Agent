import { initWorkers } from './workers/jobWorker';
import { config } from './config/env';

console.log("Starting AI Agent Dedicated Worker...");

if (!config.geminiApiKey) {
    console.error("FATAL ERROR: Please set GEMINI_API_KEY in your .env file.");
    process.exit(1);
}

try {
    initWorkers();
    console.log("BullMQ Worker initialized with Concurrency: 1");
} catch (error) {
    console.error("Failed to start the worker:", error);
    process.exit(1);
}
