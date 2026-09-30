import { Client, GatewayIntentBits, Message, Attachment, Partials } from 'discord.js';
import { config } from '../config/env';
import { AgentService } from '../services/agentService';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];

import { UserSessionRepo } from '../repositories/userSessionRepo';
import { WorkspaceRepo } from '../repositories/workspaceRepo';
import {
    ImagePlacementOptions, PlacementMode, CropMode, LayoutType,
    PLACEMENT_MODES, CROP_MODES, LAYOUT_TYPES
} from '../image/types';

export class DiscordBot {
    private client: Client;
    private userSessionRepo: UserSessionRepo;
    private workspaceRepo: WorkspaceRepo;
    /** Per-user image placement settings (in-memory; resets on restart) */
    private userImageSettings = new Map<string, ImagePlacementOptions>();

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

        this.userSessionRepo = new UserSessionRepo();
        this.workspaceRepo = new WorkspaceRepo();
        this.setupHandlers();
    }

    private getDocxAttachment(attachments: Message['attachments']): Attachment | null {
        for (const [, att] of attachments) {
            if (att.name.toLowerCase().endsWith('.docx')) return att;
        }
        return null;
    }

    private getPdfAttachment(attachments: Message['attachments']): Attachment | null {
        for (const [, att] of attachments) {
            if (att.name.toLowerCase().endsWith('.pdf')) return att;
        }
        return null;
    }

    private getExcelAttachments(attachments: Message['attachments']): Attachment[] {
        const excels: Attachment[] = [];
        for (const [, att] of attachments) {
            const name = att.name.toLowerCase();
            if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
                excels.push(att);
            }
        }
        return excels;
    }

    private getZipAttachment(attachments: Message['attachments']): Attachment | null {
        for (const [, att] of attachments) {
            if (att.name.toLowerCase().endsWith('.zip')) return att;
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
            await this.userSessionRepo.init();
            await this.workspaceRepo.init();
            console.log(`Discord Bot is ready! Logged in as ${this.client.user?.tag}`);
        });

        this.client.on('messageCreate', async (message: Message) => {
            if (message.author.bot) return;

            const caption = message.content || '';
            const userId = message.author.id;
            const docxAttachment = this.getDocxAttachment(message.attachments);
            const imageAttachments = this.getImageAttachments(message.attachments);
            const zipAttachment = (this as any).getZipAttachment ? (this as any).getZipAttachment(message.attachments) : message.attachments.find(a => a.name?.toLowerCase().endsWith('.zip'));
            const excelAttachments = (this as any).getExcelAttachments ? (this as any).getExcelAttachments(message.attachments) : Array.from(message.attachments.values()).filter(a => a.name?.toLowerCase().endsWith('.xlsx') || a.name?.toLowerCase().endsWith('.xls'));

            const msgLower = caption.trim().toLowerCase();

            // Setup AgentService for the user's active workspace
            const agentService = new AgentService();
            const activeWorkspaceId = await this.userSessionRepo.getActiveWorkspace(userId);
            agentService.setWorkspace(activeWorkspaceId || undefined);
            await agentService.init();

            // Handle Workspace Command (!workspace)
            if (msgLower.startsWith('!workspace')) {
                const args = caption.split(' ').slice(1);
                const cmd = args[0]?.toLowerCase();
                
                if (cmd === 'list') {
                    const workspaces = await this.workspaceRepo.getAll();
                    if (workspaces.length === 0) {
                        await message.reply('Belum ada workspace. Buat dari Web Dashboard.');
                        return;
                    }
                    const activeId = await this.userSessionRepo.getActiveWorkspace(userId);
                    const desc = workspaces.map((w, i) => {
                        const activeMark = w.id === activeId ? ' (Aktif ✅)' : '';
                        return `${i+1}. **${w.name}**${activeMark}`;
                    }).join('\n');
                    
                    const embed = {
                        color: 0x22C55E,
                        title: '📁 Daftar Workspace',
                        description: desc + '\n\nKetik `!workspace switch <nama>` untuk mengganti.'
                    };
                    await message.reply({ embeds: [embed] });
                    return;
                }
                
                if (cmd === 'switch') {
                    const targetName = args.slice(1).join(' ').toLowerCase();
                    if (!targetName) {
                        await message.reply('Mohon sertakan nama workspace. Contoh: `!workspace switch Laporan KP` atau `!workspace switch global`');
                        return;
                    }
                    if (targetName === 'global') {
                        await this.userSessionRepo.setActiveWorkspace(userId, null);
                        await message.reply('✅ Beralih ke Workspace **Global**.');
                        return;
                    }
                    
                    const workspaces = await this.workspaceRepo.getAll();
                    const target = workspaces.find(w => w.name.toLowerCase() === targetName);
                    
                    if (!target) {
                        await message.reply(`❌ Workspace dengan nama **${targetName}** tidak ditemukan.`);
                        return;
                    }
                    
                    await this.userSessionRepo.setActiveWorkspace(userId, target.id);
                    await message.reply(`✅ Berhasil beralih ke Workspace **${target.name}**.`);
                    return;
                }
                
                await message.reply('Perintah !workspace tersedia:\n- `!workspace list`\n- `!workspace switch <nama>`\n- `!workspace switch global`');
                return;
            }

            // Handle AI Cache & Learning Commands
            if (msgLower === '!cache') {
                const { cacheService } = require('../services/ai/CacheService');
                const stats = await cacheService.getStats();
                const desc = `📦 **Total Cached Documents:** ${stats.totalCacheEntries}\n` +
                             `🎯 **Cache Hits:** ${stats.totalHits}\n` +
                             `❌ **Cache Misses:** ${stats.totalMisses}\n` +
                             `⚡ **Hit Ratio:** ${stats.hitRatio.toFixed(1)}%`;
                await message.reply({ embeds: [{ color: 0x10b981, title: '🧠 AI Smart Cache Status', description: desc }] });
                return;
            }

            if (msgLower === '!learning') {
                const { learningService } = require('../services/ai/LearningService');
                const profile = await learningService.getProfile(userId);
                let recTemplate = await learningService.getRecommendation(userId);
                let desc = `🧑 **User ID:** ${userId}\n`;
                if (recTemplate) {
                    desc += `💡 **Rekomendasi AI:** Gunakan Template **${recTemplate}** (Confidence: >90%)\n`;
                }
                desc += `\n**Favorite Templates:**\n`;
                if (Object.keys(profile.favoriteTemplates).length > 0) {
                    for (const [tpl, count] of Object.entries(profile.favoriteTemplates)) {
                        desc += `- ${tpl} (${count}x)\n`;
                    }
                } else {
                    desc += `- Belum ada data\n`;
                }
                await message.reply({ embeds: [{ color: 0x8b5cf6, title: '📈 AI Continuous Learning Profile', description: desc }] });
                return;
            }

            if (msgLower === '!reset-learning') {
                const { learningService } = require('../services/ai/LearningService');
                await learningService.resetLearning(userId);
                await message.reply('✅ Profil AI Continuous Learning Anda telah direset.');
                return;
            }

            // Handle Merge Excel Command
            if (msgLower === '!merge-excel' || msgLower === '!mergeexcel') {
                if (excelAttachments.length < 2 && !zipAttachment) {
                    await message.reply('❌ Mohon unggah minimal 2 file Excel atau 1 file ZIP yang berisi file Excel beserta perintah ini.');
                    return;
                }
                
                const processMsg = await message.reply('⏳ Sedang menggabungkan file Excel Anda...');
                
                try {
                    let localExcelPaths: string[] = [];
                    const extractDir = require('path').join(process.cwd(), 'temp', `extracted_${Date.now()}`);
                    
                    if (zipAttachment) {
                        const AdmZip = require('adm-zip');
                        const zipPath = await agentService.fileHandler.downloadFile(zipAttachment.url, zipAttachment.name);
                        const zip = new AdmZip(zipPath);
                        require('fs').mkdirSync(extractDir, { recursive: true });
                        zip.extractAllTo(extractDir, true);
                        
                        const entries = zip.getEntries();
                        for (const entry of entries) {
                            if (!entry.isDirectory && (entry.entryName.toLowerCase().endsWith('.xlsx') || entry.entryName.toLowerCase().endsWith('.xls'))) {
                                localExcelPaths.push(require('path').join(extractDir, entry.entryName));
                            }
                        }
                    } else {
                        // Download multiple attachments
                        for (const att of excelAttachments) {
                            const localPath = await agentService.fileHandler.downloadFile(att.url, att.name);
                            localExcelPaths.push(localPath);
                        }
                    }

                    if (localExcelPaths.length < 2) {
                        await processMsg.edit('❌ Tidak cukup file Excel untuk digabungkan (minimal butuh 2).');
                        return;
                    }

                    const mergedPath = await agentService.excelMergeService.mergeExcelFiles(localExcelPaths);
                    await message.reply({
                        content: `✅ Berhasil menggabungkan ${localExcelPaths.length} file Excel!`,
                        files: [mergedPath]
                    });
                    
                    try {
                        await processMsg.delete();
                    } catch (e) {}
                    
                    // Cleanup
                    try {
                        const fs = require('fs');
                        if (fs.existsSync(extractDir)) {
                            fs.rmSync(extractDir, { recursive: true, force: true });
                        }
                    } catch (e) {}

                } catch (err: any) {
                    await processMsg.edit(`❌ Gagal menggabungkan Excel: ${err.message}`);
                }
                return;
            }


            // Handle Replace Excel Command
            if (msgLower.startsWith('!replace-excel') || msgLower.startsWith('!replaceexcel')) {
                const instruction = caption.replace(/^!replace-?excel/i, '').trim();
                
                if (!instruction) {
                    await message.reply('❌ Mohon berikan instruksi penggantian teks (contoh: `!replace-excel ganti Budi jadi Andi`).');
                    return;
                }

                let useActiveTemplate = false;
                let activeTemplatePath = '';
                let isZipTemplate = false;

                if (!zipAttachment && excelAttachments.length === 0) {
                    const activeTemplate = agentService.templateManager.getActiveTemplate(userId);
                    if (activeTemplate) {
                        if (activeTemplate.type === 'registry') {
                            activeTemplatePath = activeTemplate.metadata.filePath;
                            isZipTemplate = activeTemplate.metadata.fileType === 'zip' || activeTemplatePath.endsWith('.zip');
                        } else {
                            activeTemplatePath = activeTemplate.path;
                            isZipTemplate = activeTemplatePath.endsWith('.zip');
                        }
                        
                        if (require('fs').existsSync(activeTemplatePath)) {
                            useActiveTemplate = true;
                        } else {
                            await message.reply('❌ File template aktif tidak ditemukan di sistem.');
                            return;
                        }
                    } else {
                        await message.reply('❌ Mohon unggah file Excel/ZIP atau pilih template aktif (gunakan `!use <id>`) beserta perintah ini.');
                        return;
                    }
                }
                
                const processMsg = await message.reply('⏳ Sedang memproses instruksi dan file Anda...');
                
                try {
                    let localExcelPaths: string[] = [];
                    const extractDir = require('path').join(process.cwd(), 'temp', `extracted_replace_${Date.now()}`);
                    
                    if (zipAttachment || isZipTemplate) {
                        const AdmZip = require('adm-zip');
                        const zipPath = zipAttachment ? await agentService.fileHandler.downloadFile(zipAttachment.url, zipAttachment.name) : activeTemplatePath;
                        const zip = new AdmZip(zipPath);
                        require('fs').mkdirSync(extractDir, { recursive: true });
                        zip.extractAllTo(extractDir, true);
                        
                        const entries = zip.getEntries();
                        for (const entry of entries) {
                            if (!entry.isDirectory && (entry.entryName.toLowerCase().endsWith('.xlsx') || entry.entryName.toLowerCase().endsWith('.xls'))) {
                                localExcelPaths.push(require('path').join(extractDir, entry.entryName));
                            }
                        }
                    } else {
                        // Download single/multiple attachments or use active template excel
                        require('fs').mkdirSync(extractDir, { recursive: true });
                        if (useActiveTemplate) {
                            const newPath = require('path').join(extractDir, require('path').basename(activeTemplatePath));
                            require('fs').copyFileSync(activeTemplatePath, newPath);
                            localExcelPaths.push(newPath);
                        } else {
                            for (const att of excelAttachments) {
                            const localPath = await agentService.fileHandler.downloadFile(att.url, att.name);
                            const newPath = require('path').join(extractDir, att.name);
                            require('fs').renameSync(localPath, newPath); // Move to extractDir so we can zip it easily later
                                localExcelPaths.push(newPath);
                            }
                        }
                    }

                    if (localExcelPaths.length === 0) {
                        await processMsg.edit('❌ Tidak ditemukan file Excel untuk diproses.');
                        return;
                    }

                    // Parse instruction
                    await processMsg.edit('🧠 Menerjemahkan instruksi...');
                    let rules: any[] = [];
                    try {
                        rules = await agentService.geminiService.parseReplacementInstruction(instruction);
                    } catch (aiError: any) {
                        await processMsg.edit(`❌ Terjadi kesalahan saat menerjemahkan instruksi: ${aiError.message}`);
                        return;
                    }
                    
                    if (!rules || rules.length === 0) {
                        await processMsg.edit('❌ Gagal memahami instruksi penggantian. Pastikan kalimat Anda jelas (misal: "ganti X menjadi Y").');
                        return;
                    }

                    // Format rules for display
                    let rulesDesc = rules.map((r: any) => `- "${r.target}" ➔ "${r.replacement}"`).join('\n');

                    await processMsg.edit(`⚙️ Menerapkan ${rules.length} aturan pada ${localExcelPaths.length} file...\n${rulesDesc}`);
                    
                    await agentService.excelModifierService.batchReplace(localExcelPaths, rules);
                    
                    // Compress back to zip
                    const ZipService = require('../services/zipService').ZipService;
                    const zipService = new ZipService();
                    const outZipPath = require('path').join(process.cwd(), 'temp', `Hasil_Replace_${Date.now()}.zip`);
                    
                    await zipService.compressFolder(extractDir, outZipPath);
                    
                    const stats = require('fs').statSync(outZipPath);
                    const fileSizeMB = stats.size / (1024 * 1024);

                    if (fileSizeMB > 8) {
                        const jobId = `replace_${Date.now()}`;
                        const fileId = `${jobId}.zip`;
                        const destDir = require('path').join(process.cwd(), 'storage', 'downloads');
                        require('fs').mkdirSync(destDir, { recursive: true });
                        const destPath = require('path').join(destDir, fileId);
                        require('fs').copyFileSync(outZipPath, destPath);
                        
                        const JobManager = require('../managers/jobManager').JobManager;
                        await JobManager.getInstance().getBatchService().getRepo().add({
                            id: jobId,
                            userId: message.author.id,
                            type: 'excel-replace',
                            status: 'completed',
                            progress: 100,
                            createdAt: Date.now(),
                            updatedAt: Date.now(),
                            expireAt: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
                        });

                        await message.reply({
                            content: `✅ Selesai memodifikasi ${localExcelPaths.length} file Excel!\n\nKarena ukuran file terlalu besar untuk Discord (${fileSizeMB.toFixed(2)} MB), silakan download file hasil modifikasi melalui link berikut:\n🔗 **[Klik Disini untuk Download](https://maker-tomorrow-facts-trying.trycloudflare.com/download/${fileId})**`
                        });
                    } else {
                        await message.reply({
                            content: `✅ Selesai memodifikasi ${localExcelPaths.length} file Excel!`,
                            files: [outZipPath]
                        });
                    }
                    
                    try {
                        await processMsg.delete();
                    } catch (e) {}
                    
                    // Cleanup
                    try {
                        const fs = require('fs');
                        if (fs.existsSync(extractDir)) {
                            fs.rmSync(extractDir, { recursive: true, force: true });
                        }
                        if (fs.existsSync(outZipPath)) {
                            fs.unlinkSync(outZipPath);
                        }
                    } catch (e) {}

                } catch (err: any) {
                    await processMsg.edit(`❌ Gagal memodifikasi Excel: ${err.message}`);
                }
                return;
            }


            // Handle Chat Command (!chat or ?chat)
            if (msgLower.startsWith('!chat') || msgLower.startsWith('?chat')) {
                const provider = msgLower.startsWith('?chat') ? 'deepseek' : 'gemini';
                const prefix = msgLower.startsWith('?chat') ? '?chat' : '!chat';
                const text = caption.substring(5).trim(); // length of !chat or ?chat
                
                if (text === 'clear') {
                    if (provider === 'deepseek' && agentService.deepseekService) {
                        agentService.deepseekService.clearChat(userId);
                    } else {
                        agentService.geminiService.clearChat(userId);
                    }
                    await message.reply('Riwayat chat berhasil dihapus.');
                    return;
                }
                if (!text) {
                    await message.reply(`Ketik pesan untuk ngobrol. Contoh: \`${prefix} Halo\` atau \`${prefix} clear\` untuk reset.`);
                    return;
                }
                const typingMsg = await message.reply('🤔 Berpikir...');
                try {
                    const ai = provider === 'deepseek' && agentService.deepseekService ? agentService.deepseekService : agentService.geminiService;
                    const reply = await ai.chat(userId, text);
                    await typingMsg.edit(reply);
                } catch (e: any) {
                    // Auto-fallback to Deepseek if Gemini is unavailable (503)
                    const isUnavailable = e.message?.includes('503') || e.message?.includes('UNAVAILABLE') || e.message?.includes('high demand');
                    if (provider === 'gemini' && isUnavailable && agentService.deepseekService) {
                        try {
                            console.warn('[Discord] Gemini unavailable, falling back to Deepseek...');
                            const fallbackReply = await agentService.deepseekService.chat(userId, text);
                            await typingMsg.edit(`${fallbackReply}\n\n> ⚡ *Dijawab oleh Deepseek (Gemini sedang sibuk)*`);
                        } catch (e2: any) {
                            await typingMsg.edit(`❌ Gagal merespons: Semua layanan AI sedang sibuk, coba beberapa saat lagi.`);
                        }
                    } else {
                        await typingMsg.edit(`❌ Gagal merespons: ${e.message}`);
                    }
                }
                return;
            }

            // Template Registry Commands
            if (msgLower.startsWith('!save ') || msgLower.startsWith('!import ')) {
                const name = caption.replace(/^!(save|import)\s+/i, '').trim();
                const att = message.attachments.first();
                if (!att) {
                    await message.reply('❌ Mohon lampirkan file (DOCX/XLSX/dll) yang ingin disimpan.');
                    return;
                }
                if (!name) {
                    await message.reply('❌ Mohon berikan nama template. Contoh: `!save Laporan Harian`');
                    return;
                }
                const processingMsg = await message.reply('⏳ Menyimpan template dan menganalisis field...');
                try {
                    const tempPath = await agentService.fileHandler.downloadFile(att.url, att.name);
                    const { metadata, analysis } = await agentService.templateService.saveTemplate(tempPath, name);
                    await agentService.fileHandler.cleanupFile(tempPath);

                    let replyText = `✅ Template **${metadata.name}** berhasil disimpan dengan ID \`${metadata.id}\`.`;

                    // ── FEATURE 4: Show auto-detected fields ────────────────────────
                    if (analysis) {
                        const { TemplateAnalyzerService } = require('../services/ai/TemplateAnalyzerService');
                        const analyzer = agentService.smartMappingService.getAnalyzerService();
                        const fieldSummary = analyzer.formatFieldSummary(analysis);
                        replyText += `\n\n${fieldSummary}`;
                    }

                    await processingMsg.edit(replyText);
                } catch (e: any) {
                    await processingMsg.edit(`❌ Gagal menyimpan template: ${e.message}`);
                }
                return;
            }

            if (msgLower === '!template' || msgLower === '!templates') {
                const templates = await agentService.templateService.listTemplates();
                if (templates.length === 0) {
                    await message.reply('Belum ada template yang tersimpan.');
                    return;
                }
                const desc = templates.map((t, i) => `[**${t.id}**] ${t.name} (${t.fileType?.toUpperCase() || 'UNKNOWN'})${t.isFavorite ? ' ⭐' : ''}`).join('\n');
                await message.reply({ embeds: [{ color: 0x3b82f6, title: '📄 Daftar Template', description: desc }] });
                return;
            }

            if (msgLower.startsWith('!use ')) {
                const id = caption.replace(/^!use\s+/i, '').trim();
                const t = await agentService.templateService.getTemplate(id);
                if (!t) {
                    await message.reply(`❌ Template dengan ID atau nama \`${id}\` tidak ditemukan.`);
                    return;
                }
                agentService.templateManager.setActiveTemplate(userId, { type: 'registry', metadata: t });
                
                const excelAttachments = this.getExcelAttachments(message.attachments);
                if (excelAttachments.length === 0 && imageAttachments.length === 0 && !docxAttachment) {
                    await message.reply(`✅ Template **${t.name}** sekarang menjadi template aktif Anda.`);
                    return;
                } else {
                    await message.reply(`✅ Menggunakan template **${t.name}**...`);
                    // DO NOT RETURN. Let it fall through to process the attachments!
                }
            }

            if (msgLower === '!current') {
                const current = agentService.templateManager.getActiveTemplate(userId);
                if (!current) {
                    await message.reply('ℹ️ Tidak ada template aktif.');
                    return;
                }
                if (current.type === 'registry') {
                    await message.reply(`✅ Template aktif: **${current.metadata.name}** [ID: ${current.metadata.id}]`);
                } else {
                    await message.reply(`✅ Template aktif (temporary): **${current.name}**`);
                }
                return;
            }

            if (msgLower.startsWith('!delete ')) {
                const id = caption.replace(/^!delete\s+/i, '').trim();
                const success = await agentService.templateService.deleteTemplate(id);
                if (success) {
                    await message.reply(`✅ Template berhasil dihapus.`);
                } else {
                    await message.reply(`❌ Template tidak ditemukan atau gagal dihapus.`);
                }
                return;
            }

            if (msgLower.startsWith('!rename ')) {
                const args = caption.replace(/^!rename\s+/i, '').trim().split(' ');
                const id = args[0];
                const newName = args.slice(1).join(' ');
                if (!id || !newName) {
                    await message.reply('❌ Format salah. Contoh: `!rename 1234 Nama Baru`');
                    return;
                }
                const success = await agentService.templateService.renameTemplate(id, newName);
                if (success) await message.reply(`✅ Nama template berhasil diubah menjadi **${newName}**.`);
                else await message.reply(`❌ Template tidak ditemukan.`);
                return;
            }

            if (msgLower.startsWith('!info ')) {
                const id = caption.replace(/^!info\s+/i, '').trim();
                const t = await agentService.templateService.getTemplate(id);
                if (!t) {
                    await message.reply(`❌ Template tidak ditemukan.`);
                    return;
                }
                const info = `**ID:** ${t.id}\n**Nama:** ${t.name}\n**Tipe File:** ${t.fileType}\n**Ukuran:** ${(t.sizeBytes / 1024).toFixed(2)} KB\n**Digunakan:** ${t.usageCount} kali\n**Favorit:** ${t.isFavorite ? 'Ya ⭐' : 'Tidak'}`;
                await message.reply({ embeds: [{ color: 0x10b981, title: `ℹ️ Info Template: ${t.name}`, description: info }] });
                return;
            }

            if (msgLower.startsWith('!favorite ')) {
                const id = caption.replace(/^!favorite\s+/i, '').trim();
                const success = await agentService.templateService.toggleFavorite(id);
                if (success) await message.reply(`✅ Status favorit berhasil diubah.`);
                else await message.reply(`❌ Template tidak ditemukan.`);
                return;
            }

            if (msgLower.startsWith('!search ')) {
                const query = caption.replace(/^!search\s+/i, '').trim();
                const templates = await agentService.templateService.searchTemplates(query);
                if (templates.length === 0) {
                    await message.reply(`Pencarian **${query}** tidak menemukan hasil.`);
                    return;
                }
                const desc = templates.map((t) => `[**${t.id}**] ${t.name}`).join('\n');
                await message.reply({ embeds: [{ color: 0xf59e0b, title: `🔍 Hasil Pencarian: ${query}`, description: desc }] });
                return;
            }

            if (msgLower.startsWith('!duplicate ')) {
                const id = caption.replace(/^!duplicate\s+/i, '').trim();
                try {
                    const newT = await agentService.templateService.duplicateTemplate(id);
                    if (newT) await message.reply(`✅ Template berhasil diduplikasi dengan ID baru \`${newT.id}\`.`);
                    else await message.reply(`❌ Template tidak ditemukan.`);
                } catch (e: any) {
                    await message.reply(`❌ Gagal menduplikasi: ${e.message}`);
                }
                return;
            }

            if (msgLower.startsWith('!export ')) {
                const id = caption.replace(/^!export\s+/i, '').trim();
                const t = await agentService.templateService.getTemplate(id);
                if (!t) {
                    await message.reply(`❌ Template tidak ditemukan.`);
                    return;
                }
                await message.reply({
                    content: `📦 Berikut adalah file template **${t.name}**:`,
                    files: [t.filePath]
                });
                return;
            }

            // Handle Convert PDF to Word
            if (msgLower.startsWith('!pdf2word') || msgLower.startsWith('!pdftoword')) {
                const pdfAtt = this.getPdfAttachment(message.attachments);
                if (!pdfAtt) {
                    await message.reply('❌ Mohon lampirkan file PDF yang ingin diubah ke Word bersamaan dengan pesan ini.');
                    return;
                }
                const msg = await message.reply('⏳ Sedang mengkonversi PDF ke Word...');
                try {
                    const resultPath = await agentService.convertPdfToWord(pdfAtt.url, userId);
                    await message.reply({
                        content: '✅ Berhasil mengkonversi PDF ke Word:',
                        files: [resultPath]
                    });
                    agentService.cleanupResults([resultPath]);
                } catch (err: any) {
                    await message.reply(`❌ Gagal: ${err.message}`);
                } finally {
                    try { await msg.delete(); } catch(e){}
                }
                return;
            }

            // Handle Convert Word to PDF
            if (msgLower.startsWith('!word2pdf') || msgLower.startsWith('!wordtopdf')) {
                if (!docxAttachment) {
                    await message.reply('❌ Mohon lampirkan file Word (.docx) yang ingin diubah ke PDF bersamaan dengan pesan ini.');
                    return;
                }
                const msg = await message.reply('⏳ Sedang mengkonversi Word ke PDF...');
                try {
                    const resultPath = await agentService.convertWordToPdf(docxAttachment.url, userId);
                    await message.reply({
                        content: '✅ Berhasil mengkonversi Word ke PDF:',
                        files: [resultPath]
                    });
                    agentService.cleanupResults([resultPath]);
                } catch (err: any) {
                    await message.reply(`❌ Gagal: ${err.message}`);
                } finally {
                    try { await msg.delete(); } catch(e){}
                }
                return;
            }

            // Handle Dashboard (!dashboard)
            if (msgLower.startsWith('!dashboard')) {
                const templates = await agentService.templateRepo.getAll();
                const histories = await agentService.historyRepo.getAll();
                const totalTemplates = templates.length;
                const totalDocs = histories.length;
                const today = new Date().setHours(0,0,0,0);
                const docsToday = histories.filter(h => h.generateDate >= today).length;

                const embed = {
                    color: 0x22C55E, // Hijau sesuai request
                    title: `📊 AI Agent Dashboard ${activeWorkspaceId ? '(Workspace)' : '(Global)'}`,
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

            // Handle Memory (!ingat, !lupa)
            if (msgLower.startsWith('!lupa')) {
                await agentService.memoryRepo.clearMemory(userId);
                await message.reply('🧠 Ingatan referensi Anda telah dihapus.');
                return;
            }

            if (msgLower.startsWith('!ingat')) {
                let memoryText = caption.substring(6).trim();
                let hasAttachment = false;

                const processingMsg = await message.reply('Mengingat data referensi...');

                if (message.attachments.size > 0) {
                    const attachment = message.attachments.first()!;
                    const nameLower = attachment.name.toLowerCase();
                    try {
                        const tempPath = await (agentService as any)['fileHandler'].downloadFile(attachment.url, `temp_${userId}_${Date.now()}`);
                        
                        if (nameLower.endsWith('.xlsx')) {
                            const parsed = await agentService.excelParser.extractText(tempPath);
                            memoryText += `\n[Data dari Excel: ${attachment.name}]\n${parsed}`;
                        } else if (nameLower.endsWith('.docx')) {
                            const parsed = await (agentService as any)['docxParser'].extractText(tempPath);
                            memoryText += `\n[Data dari Dokumen: ${attachment.name}]\n${parsed}`;
                        } else {
                            memoryText += `\n[File tidak didukung: ${attachment.name}]`;
                        }

                        (agentService as any)['fileHandler'].cleanupFile(tempPath);
                        hasAttachment = true;
                    } catch (e) {
                        console.error('Error parsing memory attachment:', e);
                    }
                }

                if (!memoryText && !hasAttachment) {
                    await processingMsg.edit('Mohon berikan teks atau lampirkan file Excel/Word untuk diingat. Contoh: `!ingat data laporan keuangan bulan lalu`');
                    return;
                }

                await agentService.memoryRepo.saveMemory(userId, memoryText);
                await processingMsg.edit('✅ Data berhasil diingat! Anda dapat menggunakannya saat menggunakan perintah `!buat` atau `!template pakai`.');
                return;
            }

            // Handle Template Manager (!template)
            if (msgLower.startsWith('!template')) {
                const args = caption.split(' ').slice(1);
                const cmd = args[0]?.toLowerCase();
                
                if (cmd === 'list') {
                    const templates = await agentService.templateRepo.getAll();
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
                        const meta = await agentService.saveTemplate(docxAttachment.url, docxAttachment.name, category);
                        await message.reply(`✅ Template **${meta.name}** berhasil disimpan ke kategori **${meta.category}**!`);
                    } catch (err: any) {
                        await message.reply(`❌ Gagal menyimpan template: ${err.message}`);
                    }
                    return;
                }

                if (cmd === 'pakai') {
                    const templateId = args[1];
                    if (!templateId) {
                        await message.reply('Mohon sertakan nomor template yang ingin dipakai. Contoh: `!template pakai 1`');
                        return;
                    }
                    
                    const templates = await agentService.templateRepo.getAll();
                    const templateIndex = parseInt(templateId) - 1;
                    if (isNaN(templateIndex) || templateIndex < 0 || templateIndex >= templates.length) {
                        await message.reply('Nomor template tidak valid.');
                        return;
                    }
                    
                    const targetTemplate = templates[templateIndex];
                    const instruction = args.slice(2).join(' ') || 'Isi template ini';
                    
                    try {
                        const processingMsg = await message.reply(`🔄 Mengisi template **${targetTemplate.name}**...`);
                        
                        const memoryData = await agentService.memoryRepo.getByUserId(userId);
                        const memoryContent = memoryData ? memoryData.content : undefined;

                        const result = await agentService.processSavedTemplate(
                            targetTemplate.id,
                            instruction,
                            userId,
                            undefined,
                            'gemini',
                            memoryContent
                        );

                        const filesToSend: string[] = [result.documentPath];
                        if (result.pdfPath) filesToSend.push(result.pdfPath);

                        await message.reply({
                            content: `✨ Dokumen dari template **${targetTemplate.name}** berhasil dibuat!`,
                            files: filesToSend
                        });
                        await processingMsg.delete().catch(() => {});

                        // Save history
                        await agentService.historyRepo.add({
                            id: Date.now().toString(),
                            filename: require('path').basename(result.documentPath),
                            templateName: targetTemplate.name,
                            generateDate: Date.now(),
                            userId,
                            status: 'success',
                            processingTimeMs: 0,
                            sizeBytes: 0,
                            filePath: result.documentPath
                        });

                        agentService.cleanupResults([result.documentPath, result.pdfPath]);
                    } catch (err: any) {
                        await message.reply(`❌ Gagal menggunakan template: ${err.message}`);
                    }
                    return;
                }

                await message.reply('Perintah !template tersedia:\n- `!template list`\n- `!template upload [kategori]` (lampirkan file DOCX)\n- `!template pakai [nomor]`');
                return;
            }

            // Handle Help / Tutorial (!help)
            if (msgLower.startsWith('!help') || msgLower === '!tutorial') {
                const embed = {
                    color: 0x22C55E,
                    title: '🤖 Panduan Lengkap AI Document Assistant',
                    description: 'Berikut adalah **daftar lengkap** semua perintah yang tersedia:',
                    fields: [
                        {
                            name: '📁 Template',
                            value: '`!save <nama>` — Upload DOCX + pesan ini untuk simpan template\n`!use <nomor/ID>` — Pilih template tersimpan sebagai aktif\n`!template` / `!templates` — Daftar semua template\n`!delete <id>` — Hapus template\n`!rename <id> <nama baru>` — Ganti nama template\n`!info <id>` — Detail info template\n`!favorite <id>` — Tandai template sebagai favorit ⭐\n`!search <kata>` — Cari template berdasarkan nama\n`!duplicate <id>` — Duplikat template\n`!export <id>` — Export template'
                        },
                        {
                            name: '📊 Excel & Batch Processing',
                            value: '`!replace-excel <instruksi>` + ZIP/XLSX — Ganti teks di ratusan Excel\nContoh: `!replace-excel ganti Budi jadi Andi`\n`!mergeexcel` + ZIP — Gabungkan banyak Excel menjadi satu file\nUpload ZIP + template aktif — Batch fill dokumen otomatis'
                        },
                        {
                            name: '🛠️ Buat & Konversi Dokumen',
                            value: '`!buat <instruksi>` — Buat dokumen baru dari nol (Gemini)\n`?buat <instruksi>` — Buat dokumen baru dari nol (Deepseek)\nUpload DOCX + caption — Auto-fill template langsung\n`!pdf2word` / `!pdftoword` — Konversi PDF ke Word\n`!word2pdf` / `!wordtopdf` — Konversi Word ke PDF'
                        },
                        {
                            name: '🧠 Memori & Referensi',
                            value: '`!ingat <teks>` — Bot mengingat data referensi\nUpload Excel/Word + caption `!ingat` — Ingat dari file\n`!lupa` — Hapus semua memori referensi'
                        },
                        {
                            name: '💬 Chat & AI',
                            value: '`!chat <pesan>` — Ngobrol dengan Gemini AI\n`?chat <pesan>` — Ngobrol dengan Deepseek AI\n`!chat clear` — Reset riwayat percakapan'
                        },
                        {
                            name: '🖼️ Image Engine',
                            value: '`!image mode <mode>` — Atur cara gambar ditempatkan\n`!image layout <type>` — Atur tata letak gambar (grid, dll)\n`!image resize <75%|400x300>` — Ubah ukuran gambar\n`!image border <px> [#hex]` — Tambah border\n`!image shadow on|off` — Aktifkan shadow\n`!image watermark [%]` — Mode watermark\n`!image caption on|off` — Caption otomatis\n`!image status` — Lihat pengaturan aktif\n`!image reset` — Reset semua pengaturan gambar'
                        },
                        {
                            name: '📂 Workspace',
                            value: '`!workspace list` — Daftar workspace\n`!workspace switch <nama>` — Pindah ke workspace lain\n`!workspace switch global` — Kembali ke workspace global'
                        },
                        {
                            name: '📈 Statistik & Log',
                            value: '`!dashboard` — Statistik ringkas (template & dokumen)\n`!history` — 10 riwayat dokumen terakhir Anda\n`!setting` — Lihat pengaturan sistem'
                        },
                        {
                            name: '🌐 Web Dashboard & Web Chat',
                            value: 'Monitor storage, upload file besar, & chat langsung via web:\nhttps://couples-coleman-specifies-plates.trycloudflare.com/monitor/'
                        }
                    ],
                    footer: { text: 'Ketik !help kapan saja untuk melihat daftar ini.' }
                };
                await message.reply({ embeds: [embed] });
                return;
            }

            // Handle History (!history)
            if (msgLower.startsWith('!history')) {
                const histories = await agentService.historyRepo.getByUserId(userId);
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
                const settings = await agentService.settingsRepo.get();
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

            // Handle Image Engine Command (!image)
            if (msgLower.startsWith('!image')) {
                const args = caption.split(' ').slice(1);
                const cmd = (args[0] || 'help').toLowerCase();

                const getCurrent = (): ImagePlacementOptions => this.userImageSettings.get(userId) ?? {};
                const update = (patch: Partial<ImagePlacementOptions>) => this.userImageSettings.set(userId, { ...getCurrent(), ...patch });

                switch (cmd) {
                    case 'mode': {
                        const mode = args[1]?.toLowerCase() as PlacementMode;
                        if (!(PLACEMENT_MODES as readonly string[]).includes(mode)) {
                            await message.reply(`❌ Mode tidak valid.\nPilihan:\n${PLACEMENT_MODES.join(', ')}`);
                            return;
                        }
                        update({ mode });
                        await message.reply(`✅ Image mode: **${mode}**`);
                        break;
                    }
                    case 'layout': {
                        const layout = args[1]?.toLowerCase() as LayoutType;
                        if (!(LAYOUT_TYPES as readonly string[]).includes(layout)) {
                            await message.reply(`❌ Layout tidak valid.\nPilihan: ${LAYOUT_TYPES.join(', ')}`);
                            return;
                        }
                        update({ layout });
                        await message.reply(`✅ Layout: **${layout}**`);
                        break;
                    }
                    case 'crop': {
                        const crop = args[1]?.toLowerCase() as CropMode;
                        if (!(CROP_MODES as readonly string[]).includes(crop)) {
                            await message.reply(`❌ Crop mode tidak valid.\nPilihan: ${CROP_MODES.join(', ')}`);
                            return;
                        }
                        update({ cropMode: crop });
                        await message.reply(`✅ Crop mode: **${crop}**`);
                        break;
                    }
                    case 'border': {
                        const bw = parseInt(args[1] || '2');
                        const color = args[2] || '#000000';
                        update({ border: { width: isNaN(bw) ? 2 : bw, color } });
                        await message.reply(`✅ Border: ${bw}px warna \`${color}\``);
                        break;
                    }
                    case 'shadow': {
                        const onOff = (args[1] || 'on').toLowerCase();
                        if (onOff === 'off') {
                            const { shadow: _, ...rest } = getCurrent();
                            this.userImageSettings.set(userId, rest);
                            await message.reply('✅ Shadow dinonaktifkan.');
                        } else {
                            update({ shadow: { offsetX: 4, offsetY: 4, blur: 4, color: '#000000', opacity: 0.4 } });
                            await message.reply('✅ Shadow diaktifkan (default: 4px, 40% opacity).');
                        }
                        break;
                    }
                    case 'watermark': {
                        const pct = parseInt(args[1] || '25');
                        const opacity = (isNaN(pct) ? 25 : Math.min(100, Math.max(1, pct))) / 100;
                        update({ mode: 'watermark', opacity });
                        await message.reply(`✅ Watermark mode diaktifkan (${Math.round(opacity * 100)}% opacity).`);
                        break;
                    }
                    case 'caption': {
                        const onOff = (args[1] || 'on').toLowerCase();
                        update({ caption: onOff !== 'off' });
                        await message.reply(`✅ Caption otomatis: **${onOff !== 'off' ? 'Aktif ✅' : 'Nonaktif ❌'}**`);
                        break;
                    }
                    case 'resize': {
                        const arg = args[1] || '100%';
                        if (arg.endsWith('%')) {
                            const pct = parseInt(arg);
                            update({ resize: { mode: 'percentage', percentage: isNaN(pct) ? 100 : pct } });
                            await message.reply(`✅ Resize: ${pct}%`);
                        } else if (arg.includes('x')) {
                            const [w, h] = arg.split('x').map(Number);
                            update({ resize: { mode: 'custom', width: w || 400, height: h || 300 } });
                            await message.reply(`✅ Resize: ${w}×${h}px`);
                        } else {
                            await message.reply('❌ Format tidak valid. Gunakan `75%` atau `400x300`.');
                        }
                        break;
                    }
                    case 'margin': {
                        const vals = args.slice(1).map(Number);
                        if (vals.length === 1) {
                            update({ margin: { top: vals[0], right: vals[0], bottom: vals[0], left: vals[0] } });
                            await message.reply(`✅ Margin: ${vals[0]}px`);
                        } else if (vals.length === 4) {
                            update({ margin: { top: vals[0], right: vals[1], bottom: vals[2], left: vals[3] } });
                            await message.reply(`✅ Margin: T${vals[0]} R${vals[1]} B${vals[2]} L${vals[3]}px`);
                        } else {
                            await message.reply('❌ Gunakan `!image margin 10` (semua sisi) atau `!image margin 5 10 5 10` (T R B L).');
                        }
                        break;
                    }
                    case 'status': {
                        const s = this.userImageSettings.get(userId);
                        if (!s || Object.keys(s).length === 0) {
                            await message.reply('ℹ️ Tidak ada pengaturan gambar aktif (menggunakan default).');
                            return;
                        }
                        const lines = Object.entries(s).map(([k, v]) => `• **${k}**: \`${JSON.stringify(v)}\``);
                        await message.reply(`⚙️ **Pengaturan Gambar Aktif**\n\n${lines.join('\n')}`);
                        break;
                    }
                    case 'reset': {
                        this.userImageSettings.delete(userId);
                        await message.reply('✅ Pengaturan gambar direset ke default.');
                        break;
                    }
                    default: {
                        const modeList = PLACEMENT_MODES.join(' | ');
                        const cropList = CROP_MODES.join(' | ');
                        const layoutList = LAYOUT_TYPES.join(' | ');
                        await message.reply(
                            `🖼️ **Image Engine — Perintah**\n\n` +
                            `**!image mode \\<mode\\>**\n_${modeList}_\n\n` +
                            `**!image layout \\<type\\>**\n_${layoutList}_\n\n` +
                            `**!image crop \\<mode\\>**\n_${cropList}_\n\n` +
                            `**!image border \\<px\\> [\\<#hex\\>]** — contoh: \`!image border 3 #FF0000\`\n\n` +
                            `**!image shadow on|off**\n\n` +
                            `**!image watermark [opacity%]** — contoh: \`!image watermark 30\`\n\n` +
                            `**!image caption on|off**\n\n` +
                            `**!image resize \\<75%|400x300\\>**\n\n` +
                            `**!image margin \\<px\\>** atau \`!image margin T R B L\`\n\n` +
                            `**!image status** — lihat pengaturan aktif\n` +
                            `**!image reset** — hapus semua pengaturan\n\n` +
                            `_Pengaturan berlaku untuk dokumen berikutnya yang memiliki placeholder gambar._`
                        );
                        break;
                    }
                }
                return;
            }

            // Handle "Generate from scratch" mode (!buat or ?buat command)
            if (msgLower.startsWith('!buat') || msgLower.startsWith('?buat')) {
                const provider = msgLower.startsWith('?buat') ? 'deepseek' : 'gemini';
                const instruction = caption.substring(5).trim();
                
                if (!instruction) {
                    await message.reply('Mohon berikan instruksi setelah perintah. Contoh: `!buat Buatkan surat izin sakit`');
                    return;
                }

                const imageUrls = imageAttachments.map(a => a.url);
                const processingMsg = await message.reply('Membuat dokumen dari awal. Mohon tunggu...');
                const startTime = Date.now();

                try {
                    const memoryData = await agentService.memoryRepo.getByUserId(userId);
                    const memoryContent = memoryData ? memoryData.content : undefined;

                    const result = await agentService.generateDocumentFromScratch(
                        instruction,
                        userId,
                        imageUrls.length > 0 ? imageUrls : undefined,
                        provider,
                        memoryContent
                    );

                    const filesToSend: string[] = [result.documentPath];
                    if (result.pdfPath) filesToSend.push(result.pdfPath);

                    await message.reply({
                        content: `✨ Dokumen berhasil dibuat!`,
                        files: filesToSend
                    });

                    // Save history
                    await agentService.historyRepo.add({
                        id: Date.now().toString(),
                        filename: require('path').basename(result.documentPath),
                        templateName: 'N/A (Dari Nol)',
                        generateDate: Date.now(),
                        userId,
                        status: 'success',
                        processingTimeMs: Date.now() - startTime,
                        sizeBytes: 0,
                        filePath: result.documentPath
                    });

                    agentService.cleanupResults([result.documentPath, result.pdfPath]);
                } catch (error: any) {
                    console.error('Error handling buat command:', error);
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

            // (zipAttachment and excelAttachments are now declared at the top)

            // Handle Active Template / Processing mode
            const activeTemplateState = agentService.templateManager.getActiveTemplate(userId);
            
            if (!docxAttachment && !activeTemplateState) {
                // If they just send random images or text, and no active template, ignore (or handle chat)
                if (message.attachments.size > 0 && imageAttachments.length === 0 && excelAttachments.length === 0 && !zipAttachment) return; 
                // Only return if they aren't trying to chat. Discord has !chat but if it's not a command, we usually ignore.
                return;
            }

            let activeTemplatePath = '';
            
            // If they uploaded a DOCX, download and set it as active (temporary)
            if (docxAttachment) {
                const localPath = await agentService.downloadActiveTemplate(docxAttachment.url, userId);
                agentService.templateManager.setActiveTemplate(userId, { type: 'temporary', path: localPath, name: docxAttachment.name });
                activeTemplatePath = localPath;

                if (!caption && imageAttachments.length === 0) {
                    await message.reply(
                        '✅ Template DOCX telah menjadi template aktif (temporary) Anda! Silakan kirimkan instruksi teks atau foto kapan saja untuk mengisi template ini.\n\nKetik `!lupatemplate` jika Anda ingin keluar dari mode ini.'
                    );
                    return;
                }
            } else {
                // Use existing active template
                if (activeTemplateState!.type === 'registry') {
                    activeTemplatePath = activeTemplateState!.metadata.filePath;
                    // Increment usage
                    await agentService.templateService.incrementUsage(activeTemplateState!.metadata.id);
                } else {
                    activeTemplatePath = activeTemplateState!.path;
                }
            }

            const provider = msgLower.startsWith('?') ? 'deepseek' : 'gemini';
            let finalCaption = caption;
            if (msgLower.startsWith('?') || msgLower.startsWith('!')) {
                finalCaption = caption.substring(1).trim();
            }

            // Build status message
            let modeMsg = `⏳ Memproses template dokumen Anda (${provider}), mohon tunggu...`;
            if (zipAttachment || excelAttachments.length > 1 || msgLower.startsWith('!batch')) {
                // --- BATCH MODE ---
                const { JobManager } = require('../managers/jobManager');
                const batchService = JobManager.getInstance().getBatchService();
                const AdmZip = require('adm-zip');

                let items: any[] = [];

                const initMsg = await message.reply('⏳ Menyiapkan Batch Job...');
                
                try {
                    if (zipAttachment) {
                        const zipPath = await agentService.fileHandler.downloadFile(zipAttachment.url, zipAttachment.name);
                        const zip = new AdmZip(zipPath);
                        const zipEntries = zip.getEntries();
                        
                        const extractDir = require('path').join(process.cwd(), 'storage', 'temp', `extracted_${Date.now()}`);
                        require('fs').mkdirSync(extractDir, { recursive: true });
                        zip.extractAllTo(extractDir, true);

                        zipEntries.forEach((entry: any) => {
                            if (!entry.isDirectory && (entry.entryName.toLowerCase().endsWith('.xlsx') || entry.entryName.toLowerCase().endsWith('.xls'))) {
                                items.push({
                                    name: require('path').basename(entry.entryName),
                                    urlOrPath: require('path').join(extractDir, entry.entryName),
                                    isLocal: true
                                });
                            }
                        });
                    } else if (excelAttachments.length > 0) {
                        items = excelAttachments.map(att => ({
                            name: att.name,
                            urlOrPath: att.url,
                            isLocal: false
                        }));
                    }

                    if (items.length === 0) {
                        await initMsg.edit('❌ Tidak ada file Excel ditemukan untuk diproses dalam batch ini.');
                        return;
                    }

                    let lastUpdate = 0;
                    const onProgress = async (job: any) => {
                        const now = Date.now();
                        if (job.status === 'completed') {
                            const summary = `✅ **Batch selesai diproses.**\n\nBerhasil:\n${job.successCount} file\n\nGagal:\n${job.failedCount} file\n\nDownload Link (Opsional):\n${config.publicUrl}${job.downloadUrl}`;
                            
                            const zipPath = require('path').join(process.cwd(), 'storage', 'downloads', `${job.id}.zip`);
                            if (job.zipSize && job.zipSize < 25 * 1024 * 1024 && require('fs').existsSync(zipPath)) {
                                try { 
                                    await initMsg.edit({ 
                                        content: summary, 
                                        files: [{ attachment: zipPath, name: `Batch_${job.id}.zip` }] 
                                    }); 
                                } catch (e) {
                                    await initMsg.edit(summary + '\n*(Gagal mengunggah file langsung, silakan gunakan link).*');
                                }
                            } else {
                                try { await initMsg.edit(summary); } catch (e) {}
                            }
                        } else if (job.status === 'processing') {
                            // Update max once every 3 seconds to avoid Discord rate limits
                            if (now - lastUpdate > 3000) {
                                lastUpdate = now;
                                try { await initMsg.edit(`🔄 Processing... \n${job.successCount + job.failedCount}/${job.totalFiles} file`); } catch (e) {}
                            }
                        }
                    };

                    const templateId = activeTemplateState!.type === 'registry' ? activeTemplateState!.metadata.id : 'temporary';
                    
                    await batchService.createBatchJob(
                        userId,
                        templateId,
                        activeTemplatePath,
                        items,
                        onProgress
                    );
                    
                    await initMsg.edit(`⏳ Batch Job dibuat! Mengantre untuk diproses...\nTotal file: ${items.length}`);
                } catch (e: any) {
                    await initMsg.edit(`❌ Gagal memulai Batch Job: ${e.message}`);
                }
                return;
            }

            if (excelAttachments.length > 0 && imageAttachments.length > 0) {
                modeMsg = `📊 Memproses dengan **${excelAttachments.length} file Excel** dan **${imageAttachments.length} gambar**, mohon tunggu...`;
            } else if (excelAttachments.length > 0) {
                modeMsg = `📊 Ditemukan **${excelAttachments.length} file Excel** — memproses struktur data, mohon tunggu...`;
            } else if (imageAttachments.length > 0) {
                modeMsg = `🖼️ Ditemukan **${imageAttachments.length} gambar** — memproses dengan Vision, mohon tunggu...`;
            }

            const processingMsg = await message.reply(modeMsg);
            const startTime = Date.now();

            try {
                const imageUrls = imageAttachments.map(a => a.url);
                const excelUrls = excelAttachments.map(a => a.url);

                const memoryData = await agentService.memoryRepo.getByUserId(userId);
                const memoryContent = memoryData ? memoryData.content : undefined;
                const imageOptions: ImagePlacementOptions = this.userImageSettings.get(userId) || {
                    mode: 'fit_inside',
                    layout: 'single'
                };

                let defaultInstruction = 'Ekstrak semua informasi dari gambar yang dilampirkan.';
                if (excelAttachments.length > 0) defaultInstruction = 'Buat laporan narasi dari data Excel yang dilampirkan.';

                const result = await agentService.processDocument(
                    activeTemplatePath,
                    finalCaption || defaultInstruction,
                    userId,
                    imageUrls.length > 0 ? imageUrls : undefined,
                    provider,
                    memoryContent,
                    imageOptions,
                    excelUrls.length > 0 ? excelUrls : undefined
                );

                const filesToSend: string[] = [result.documentPath];
                if (result.pdfPath) filesToSend.push(result.pdfPath);

                let successMsg = `✅ Berikut hasil pengisian dokumen Anda`;
                if (imageAttachments.length > 0 || excelAttachments.length > 0) {
                    const parts = [];
                    if (excelAttachments.length > 0) parts.push(`${excelAttachments.length} Excel`);
                    if (imageAttachments.length > 0) parts.push(`${imageAttachments.length} gambar`);
                    successMsg += ` (${parts.join(' & ')} dimasukkan)`;
                }
                successMsg += ':';

                await message.reply({
                    content: successMsg,
                    files: filesToSend
                });
                
                // Save history
                await agentService.historyRepo.add({
                    id: Date.now().toString(),
                    filename: require('path').basename(result.documentPath),
                    templateName: docxAttachment ? docxAttachment.name : 'Active Template',
                    generateDate: Date.now(),
                    userId,
                    status: 'success',
                    processingTimeMs: Date.now() - startTime,
                    sizeBytes: 0,
                    filePath: result.documentPath
                });

                agentService.cleanupResults([result.documentPath, result.pdfPath]);

            } catch (error: any) {
                console.error('Error handling Discord document template:', error);
                await message.reply(`❌ Maaf, terjadi kesalahan: ${error.message || 'Gagal memproses dokumen.'}`);
                await agentService.logRepo.log('error', `Template failed for user ${userId}: ${error.message}`);
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
