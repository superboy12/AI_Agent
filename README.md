# 🤖 AI Agent Document Assistant

AI Agent Document Assistant is an intelligent bot integrated with Discord and Telegram that automatically fills DOCX templates using Google's Gemini Vision AI. Simply upload a template, provide an instruction, and the AI will extract necessary data (even from images) to instantly generate a ready-to-use document in DOCX and PDF formats.

## ✨ Features

* **Multi-Platform:** Fully integrated with both Discord and Telegram.
* **Smart Template Filling:** Automatically map text instructions or image data into predefined text placeholders `{%placeholder}` inside your `.docx` templates.
* **Vision AI Supported:** Attach images and the AI will "read" the visual content to populate your document data intelligently.
* **Generate From Scratch:** Use the `!buat` (Discord) or `/buat` (Telegram) command to let the AI create a full document structure out of thin air.
* **Local Storage & Repository:** Safely stores templates, chat history, and configuration locally without relying on external databases.
* **Dashboard & Metrics:** Check bot usage and statistics directly from the chat (`!dashboard`).
* **Continuous Chat Memory:** Retains chat context during interactions for a seamless experience.

## 🚀 Quick Start

### 1. Requirements
* Node.js v18+
* PM2 (optional, for running in background)
* Google Gemini API Key
* Discord Bot Token
* Telegram Bot Token

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/superboy12/AI_Agent.git
cd AI_Agent

# Install dependencies
npm install
```

### 3. Configuration
Create a `.env` file in the root directory and add your keys:
```env
GEMINI_API_KEY=your_gemini_api_key_here
DISCORD_TOKEN=your_discord_bot_token_here
TELEGRAM_TOKEN=your_telegram_bot_token_here
PORT=3000
```

### 4. Running the Bot
For Development:
```bash
npm run dev
```

For Production (using PM2):
```bash
npm install -g pm2
pm2 start ecosystem.config.js
```

## 📚 Bot Commands

### Discord
* `!template upload [category]` : Upload a new `.docx` template (attach the file with the message).
* `!template list` : View all saved templates.
* `!buat [instruction]` : Generate a document from scratch.
* `!history` : View your latest generated documents.
* `!chat [message]` : Have a conversation with the AI. (`!chat clear` to reset).
* `!dashboard` : View bot statistics.
* `!setting` : View bot settings.

### Telegram
* `/template upload [category]` : Upload a new `.docx` template (attach the file with the caption).
* `/template list` : View all saved templates.
* `/buat [instruction]` : Generate a document from scratch.
* `/history` : View your latest generated documents.
* `/chat [message]` : Have a conversation with the AI.
* `/dashboard` : View bot statistics.
* `/setting` : View bot settings.

## ⚙️ Architecture

Built using modern **Node.js** and **TypeScript** following the Clean Architecture patterns (Controllers -> Services -> Repositories).
* **Gemini API:** Processes Natural Language and Vision inputs.
* **Docxtemplater & Mammoth:** For advanced `.docx` parsing and filling.
* **Sharp:** For precise image handling and rotation correction.
* **LibreOffice:** Handles the conversion from `.docx` to `.pdf`.

## 📜 License
This project is licensed under the MIT License.
