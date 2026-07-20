import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';
import { config } from '../config/env';
import { AgentService } from '../services/agentService';

export class TelegramBot {
    private bot: Telegraf;
    private agentService: AgentService;

    constructor() {
        if (!config.telegramToken) {
            throw new Error("Telegram token is not configured!");
        }
        this.bot = new Telegraf(config.telegramToken);
        this.agentService = new AgentService();
        this.setupHandlers();
    }

    private setupHandlers(): void {
        this.bot.start(async (ctx) => {
            await this.agentService.init();
            ctx.reply('Halo! Saya adalah AI Document Assistant.\nKirimkan file template (.docx) beserta pesan instruksi untuk mengisinya.\n\nPerintah tambahan:\n/dashboard\n/chat\n/history\n/template\n/setting\n/buat');
        });

        // Command: /dashboard
        this.bot.command('dashboard', async (ctx) => {
            const templates = await this.agentService.templateRepo.getAll();
            const histories = await this.agentService.historyRepo.getAll();
            const today = new Date().setHours(0,0,0,0);
            const docsToday = histories.filter(h => h.generateDate >= today).length;
            
            const msg = `📊 *AI Agent Dashboard*\n\n` +
                        `Total Template: ${templates.length}\n` +
                        `Total Dokumen: ${histories.length}\n` +
                        `Dokumen Hari Ini: ${docsToday}`;
            await ctx.reply(msg, { parse_mode: 'Markdown' });
        });

        // Command: /template
        this.bot.command('template', async (ctx) => {
            const args = ctx.message.text.split(' ').slice(1);
            if (args[0]?.toLowerCase() === 'list') {
                const templates = await this.agentService.templateRepo.getAll();
                if (templates.length === 0) {
                    await ctx.reply('Belum ada template yang disimpan.');
                    return;
                }
                const msg = `📁 *Daftar Template*\n\n` +
                            templates.map((t, i) => `${i+1}. ${t.name} (Dipakai: ${t.usageCount}x)`).join('\n');
                await ctx.reply(msg, { parse_mode: 'Markdown' });
                return;
            }
            await ctx.reply('Perintah tersedia: `/template list`');
        });

        // Command: /history
        this.bot.command('history', async (ctx) => {
            const userId = ctx.from.id.toString();
            const histories = await this.agentService.historyRepo.getByUserId(userId);
            if (histories.length === 0) {
                await ctx.reply('Riwayat dokumen Anda kosong.');
                return;
            }
            const msg = `🕒 *Riwayat Dokumen Anda*\n\n` +
                        histories.slice(-10).map((h, i) => `${i+1}. ${h.filename} (Tgl: ${new Date(h.generateDate).toLocaleDateString()})`).join('\n');
            await ctx.reply(msg, { parse_mode: 'Markdown' });
        });

        // Command: /setting
        this.bot.command('setting', async (ctx) => {
            const settings = await this.agentService.settingsRepo.get();
            const msg = `⚙️ *Pengaturan*\n\n` +
                        `Tema: ${settings.theme}\n` +
                        `Bahasa: ${settings.language}\n` +
                        `Auto Save: ${settings.autoSave ? 'Ya' : 'Tidak'}`;
            await ctx.reply(msg, { parse_mode: 'Markdown' });
        });

        // Command: /chat
        this.bot.command('chat', async (ctx) => {
            const text = ctx.message.text.replace(/^\/chat/i, '').trim();
            const userId = ctx.from.id.toString();

            if (text === 'clear') {
                this.agentService.geminiService.clearChat(userId);
                await ctx.reply('Riwayat chat berhasil dihapus.');
                return;
            }
            if (!text) {
                await ctx.reply('Ketik pesan untuk ngobrol. Contoh: `/chat Halo` atau `/chat clear` untuk reset.');
                return;
            }
            
            const typingMsg = await ctx.reply('🤔 Berpikir...');
            try {
                const reply = await this.agentService.geminiService.chat(userId, text);
                await ctx.telegram.editMessageText(ctx.chat.id, typingMsg.message_id, undefined, reply);
            } catch (e: any) {
                await ctx.telegram.editMessageText(ctx.chat.id, typingMsg.message_id, undefined, `❌ Gagal merespons: ${e.message}`);
            }
        });

        // Command: /buat
        this.bot.command('buat', async (ctx) => {
            const instruction = ctx.message.text.replace(/^\/buat/i, '').trim();
            const userId = ctx.from.id.toString();

            if (!instruction) {
                await ctx.reply('Mohon berikan instruksi. Contoh: `/buat Buatkan laporan singkat`');
                return;
            }

            const processingMsg = await ctx.reply('🛠️ Membuat dokumen baru dari nol, mohon tunggu...');
            const startTime = Date.now();

            try {
                const result = await this.agentService.generateDocumentFromScratch(instruction, userId);
                
                await ctx.replyWithDocument({ source: result.docxPath });
                if (result.pdfPath) {
                    await ctx.replyWithDocument({ source: result.pdfPath });
                }

                // Save history
                await this.agentService.historyRepo.add({
                    id: Date.now().toString(),
                    filename: require('path').basename(result.docxPath),
                    templateName: 'N/A (Dari Nol)',
                    generateDate: Date.now(),
                    userId,
                    status: 'success',
                    processingTimeMs: Date.now() - startTime,
                    sizeBytes: 0,
                    filePath: result.docxPath
                });

                this.agentService.cleanupResults([result.docxPath, result.pdfPath]);
            } catch (error: any) {
                console.error('Error handling /buat command:', error);
                await ctx.reply(`❌ Maaf, gagal membuat dokumen: ${error.message || 'Error internal.'}`);
            } finally {
                await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});
            }
        });

        this.bot.on(message('document'), async (ctx) => {
            try {
                const document = ctx.message.document;
                const caption = ctx.message.caption || '';
                const userId = ctx.from.id.toString();

                if (!document.file_name?.endsWith('.docx')) {
                    await ctx.reply('Mohon maaf, saat ini saya hanya mendukung file template format DOCX.');
                    return;
                }

                if (!caption) {
                    await ctx.reply('Mohon berikan instruksi di bagian caption (pesan) saat mengirim dokumen.');
                    return;
                }

                // Get file URL from Telegram
                const fileLink = await ctx.telegram.getFileLink(document.file_id);

                // Check if user is uploading a template
                if (caption.trim().toLowerCase().startsWith('/template upload')) {
                    const args = caption.split(' ').slice(2);
                    const category = args.join(' ') || 'General';
                    
                    try {
                        const meta = await this.agentService.saveTemplate(fileLink.href, document.file_name, category);
                        await ctx.reply(`✅ Template *${meta.name}* berhasil disimpan ke kategori *${meta.category}*!`, { parse_mode: 'Markdown' });
                    } catch (err: any) {
                        await ctx.reply(`❌ Gagal menyimpan template: ${err.message}`);
                    }
                    return;
                }

                const processingMsg = await ctx.reply('⏳ Memproses dokumen Anda, mohon tunggu...');
                const startTime = Date.now();
                
                // Process the document
                const result = await this.agentService.processDocument(fileLink.href, caption, userId);

                // Send back the files
                await ctx.replyWithDocument({ source: result.docxPath, filename: `Hasil_${document.file_name}` });
                
                if (result.pdfPath) {
                    await ctx.replyWithDocument({ source: result.pdfPath, filename: `Hasil_${document.file_name.replace('.docx', '.pdf')}` });
                }

                // Save history
                await this.agentService.historyRepo.add({
                    id: Date.now().toString(),
                    filename: require('path').basename(result.docxPath),
                    templateName: document.file_name,
                    generateDate: Date.now(),
                    userId,
                    status: 'success',
                    processingTimeMs: Date.now() - startTime,
                    sizeBytes: 0,
                    filePath: result.docxPath
                });

                // Cleanup generated files
                this.agentService.cleanupResults([result.docxPath, result.pdfPath]);

                // Delete the "processing..." message
                await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});
                
            } catch (error: any) {
                console.error('Error handling document:', error);
                await ctx.reply(`❌ Maaf, terjadi kesalahan: ${error.message || 'Gagal memproses dokumen.'}`);
            }
        });
    }

    public start(): void {
        this.bot.launch();
        console.log('Telegram Bot is running...');

        // Enable graceful stop
        process.once('SIGINT', () => this.bot.stop('SIGINT'));
        process.once('SIGTERM', () => this.bot.stop('SIGTERM'));
    }
}
