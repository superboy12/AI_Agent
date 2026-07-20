import { Client, GatewayIntentBits, Message, Attachment, Partials } from 'discord.js';
import { config } from '../config/env';
import { AgentService } from '../services/agentService';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

export class DiscordBot {
    private client: Client;
    private agentService: AgentService;

    constructor() {
        if (!config.discordToken) {
            throw new Error("Discord token is not configured!");
        }

        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent,
                GatewayIntentBits.DirectMessages
            ],
            partials: [Partials.Channel, Partials.Message]
        });

        this.agentService = new AgentService();
        this.setupHandlers();
    }

    private getDocxAttachment(attachments: Message['attachments']): Attachment | null {
        for (const [, att] of attachments) {
            if (att.name.toLowerCase().endsWith('.docx')) return att;
        }
        return null;
    }

    private getImageAttachments(attachments: Message['attachments']): Attachment[] {
        const images: Attachment[] = [];
        for (const [, att] of attachments) {
            const name = att.name.toLowerCase();
            if (IMAGE_EXTENSIONS.some(ext => name.endsWith(ext))) {
                images.push(att);
            }
        }
        return images;
    }

    private setupHandlers(): void {
        this.client.once('clientReady', async () => {
            await this.agentService.init();
            console.log(`Discord Bot is ready! Logged in as ${this.client.user?.tag}`);
        });

        this.client.on('messageCreate', async (message: Message) => {
            if (message.author.bot) return;

            const caption = message.content || '';
            const userId = message.author.id;
            const docxAttachment = this.getDocxAttachment(message.attachments);
            const imageAttachments = this.getImageAttachments(message.attachments);

            const msgLower = caption.trim().toLowerCase();

            // Handle Chat Command (!chat)
            if (msgLower.startsWith('!chat')) {
                const text = caption.replace(/^!chat/i, '').trim();
                if (text === 'clear') {
                    this.agentService.geminiService.clearChat(userId);
                    await message.reply('Riwayat chat berhasil dihapus.');
                    return;
                }
                if (!text) {
                    await message.reply('Ketik pesan untuk ngobrol. Contoh: `!chat Halo` atau `!chat clear` untuk reset.');
                    return;
                }
                const typingMsg = await message.reply('🤔 Berpikir...');
                try {
                    const reply = await this.agentService.geminiService.chat(userId, text);
                    await typingMsg.edit(reply);
                } catch (e: any) {
                    await typingMsg.edit(`❌ Gagal merespons: ${e.message}`);
                }
                return;
            }

            // Handle Dashboard (!dashboard)
            if (msgLower.startsWith('!dashboard')) {
                const templates = await this.agentService.templateRepo.getAll();
                const histories = await this.agentService.historyRepo.getAll();
                const totalTemplates = templates.length;
                const totalDocs = histories.length;
                const today = new Date().setHours(0,0,0,0);
                const docsToday = histories.filter(h => h.generateDate >= today).length;

                const embed = {
                    color: 0x22C55E, // Hijau sesuai request
                    title: '📊 AI Agent Dashboard',
                    fields: [
                        { name: 'Total Template', value: totalTemplates.toString(), inline: true },
                        { name: 'Total Dokumen Dibuat', value: totalDocs.toString(), inline: true },
                        { name: 'Dokumen Hari Ini', value: docsToday.toString(), inline: true },
                    ],
                    timestamp: new Date().toISOString()
                };
                await message.reply({ embeds: [embed] });
                return;
            }

            // Handle Template Manager (!template)
            if (msgLower.startsWith('!template')) {
                const args = caption.split(' ').slice(1);
                const cmd = args[0]?.toLowerCase();
                
                if (cmd === 'list') {
                    const templates = await this.agentService.templateRepo.getAll();
                    if (templates.length === 0) {
                        await message.reply('Belum ada template yang disimpan.');
                        return;
                    }
                    const embed = {
                        color: 0x22C55E,
                        title: '📁 Daftar Template',
                        description: templates.map((t, i) => `${i+1}. **${t.name}** (Dipakai: ${t.usageCount}x, Kat: ${t.category})`).join('\n')
                    };
                    await message.reply({ embeds: [embed] });
                    return;
                }
                
                if (cmd === 'upload') {
                    if (!docxAttachment) {
                        await message.reply('Mohon lampirkan file .docx untuk di-upload sebagai template.\nContoh caption: `!template upload Surat`');
                        return;
                    }
                    const category = args.slice(1).join(' ') || 'General';
                    try {
                        const meta = await this.agentService.saveTemplate(docxAttachment.url, docxAttachment.name, category);
                        await message.reply(`✅ Template **${meta.name}** berhasil disimpan ke kategori **${meta.category}**!`);
                    } catch (err: any) {
                        await message.reply(`❌ Gagal menyimpan template: ${err.message}`);
                    }
                    return;
                }

                await message.reply('Perintah !template tersedia:\n- `!template list`\n- `!template upload [kategori]` (sambil melampirkan file DOCX)');
                return;
            }

            // Handle History (!history)
            if (msgLower.startsWith('!history')) {
                const histories = await this.agentService.historyRepo.getByUserId(userId);
                if (histories.length === 0) {
                    await message.reply('Riwayat dokumen Anda kosong.');
                    return;
                }
                const embed = {
                    color: 0x22C55E,
                    title: '🕒 Riwayat Dokumen Anda',
                    description: histories.slice(-10).map((h, i) => `${i+1}. **${h.filename}** (Tgl: ${new Date(h.generateDate).toLocaleDateString()})`).join('\n')
                };
                await message.reply({ embeds: [embed] });
                return;
            }

            // Handle Settings (!setting)
            if (msgLower.startsWith('!setting')) {
                const settings = await this.agentService.settingsRepo.get();
                const embed = {
                    color: 0x22C55E,
                    title: '⚙️ Pengaturan',
                    fields: [
                        { name: 'Tema', value: settings.theme, inline: true },
                        { name: 'Bahasa', value: settings.language, inline: true },
                        { name: 'Auto Save', value: settings.autoSave ? 'Ya' : 'Tidak', inline: true }
                    ]
                };
                await message.reply({ embeds: [embed] });
                return;
            }

            // Handle "Generate from scratch" mode (!buat command)
            if (msgLower.startsWith('!buat')) {
                const instruction = caption.replace(/^!buat/i, '').trim();
                
                if (!instruction) {
                    await message.reply('Mohon berikan instruksi setelah perintah !buat. Contoh: `!buat Buatkan surat izin sakit`');
                    return;
                }

                const modeMsg = imageAttachments.length > 0 
                    ? `🛠️ Membuat dokumen baru dari nol dengan referensi ${imageAttachments.length} gambar...`
                    : '🛠️ Membuat dokumen baru dari nol, mohon tunggu...';
                
                const processingMsg = await message.reply(modeMsg);
                const startTime = Date.now();

                try {
                    const imageUrls = imageAttachments.map(a => a.url);
                    const result = await this.agentService.generateDocumentFromScratch(
                        instruction,
                        userId,
                        imageUrls
                    );

                    const filesToSend: string[] = [result.docxPath];
                    if (result.pdfPath) filesToSend.push(result.pdfPath);

                    await message.reply({
                        content: `✨ Dokumen berhasil dibuat!`,
                        files: filesToSend
                    });

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
                    console.error('Error handling !buat command:', error);
                    await message.reply(`❌ Maaf, gagal membuat dokumen: ${error.message || 'Error internal.'}`);
                } finally {
                    try {
                        await processingMsg.delete();
                    } catch (e) {
                        console.error('Failed to delete processing message:', e);
                    }
                }
                return;
            }

            // Handle "Template" mode
            if (message.attachments.size === 0) return;
            if (!docxAttachment) return;

            if (!caption && imageAttachments.length === 0) {
                await message.reply(
                    'Mohon berikan instruksi di pesan Anda, atau lampirkan gambar sebagai sumber data bersama template DOCX.'
                );
                return;
            }

            // Build status message
            let modeMsg = '⏳ Memproses template dokumen Anda, mohon tunggu...';
            if (imageAttachments.length > 0) {
                modeMsg = `🖼️ Ditemukan **${imageAttachments.length} gambar** — memproses dengan Gemini Vision, mohon tunggu...`;
            }

            const processingMsg = await message.reply(modeMsg);
            const startTime = Date.now();

            try {
                const imageUrls = imageAttachments.map(a => a.url);

                const result = await this.agentService.processDocument(
                    docxAttachment.url,
                    caption || 'Ekstrak semua informasi dari gambar yang dilampirkan.',
                    userId,
                    imageUrls
                );

                const filesToSend: string[] = [result.docxPath];
                if (result.pdfPath) filesToSend.push(result.pdfPath);

                await message.reply({
                    content: `✅ Berikut hasil pengisian dokumen Anda${imageAttachments.length > 0 ? ` (${imageAttachments.length} gambar dimasukkan)` : ''}:`,
                    files: filesToSend
                });
                
                // Save history
                await this.agentService.historyRepo.add({
                    id: Date.now().toString(),
                    filename: require('path').basename(result.docxPath),
                    templateName: docxAttachment.name,
                    generateDate: Date.now(),
                    userId,
                    status: 'success',
                    processingTimeMs: Date.now() - startTime,
                    sizeBytes: 0,
                    filePath: result.docxPath
                });

                this.agentService.cleanupResults([result.docxPath, result.pdfPath]);

            } catch (error: any) {
                console.error('Error handling Discord document template:', error);
                await message.reply(`❌ Maaf, terjadi kesalahan: ${error.message || 'Gagal memproses dokumen.'}`);
                await this.agentService.logRepo.log('error', `Template failed for user ${userId}: ${error.message}`);
            } finally {
                try {
                    await processingMsg.delete();
                } catch (e) {
                    console.error('Failed to delete processing message:', e);
                }
            }
        });
    }

    public start(): void {
        this.client.login(config.discordToken);
    }
}
