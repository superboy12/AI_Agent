import { Telegraf, Context } from 'telegraf';
import { message } from 'telegraf/filters';
import { config } from '../config/env';
import { AgentService } from '../services/agentService';
import { UserSessionRepo } from '../repositories/userSessionRepo';
import { WorkspaceRepo } from '../repositories/workspaceRepo';
import {
    ImagePlacementOptions, PlacementMode, CropMode, LayoutType,
    PLACEMENT_MODES, CROP_MODES, LAYOUT_TYPES
} from '../image/types';

interface MyContext extends Context {
    agentService: AgentService;
}

export class TelegramBot {
    private bot: Telegraf<MyContext>;
    private userSessionRepo: UserSessionRepo;
    private workspaceRepo: WorkspaceRepo;
    /** Per-user image placement settings (in-memory; resets on restart) */
    private userImageSettings = new Map<string, ImagePlacementOptions>();

    constructor() {
        if (!config.telegramToken) {
            throw new Error("Telegram token is not configured!");
        }
        this.bot = new Telegraf<MyContext>(config.telegramToken);
        this.userSessionRepo = new UserSessionRepo();
        this.workspaceRepo = new WorkspaceRepo();
        this.setupHandlers();
    }
    private setupHandlers(): void {
        this.bot.start(async (ctx) => {
            await this.userSessionRepo.init();
            await this.workspaceRepo.init();
            await ctx.reply('Halo! Saya adalah AI Document Assistant.\nKirimkan file template (.docx) beserta pesan instruksi untuk mengisinya.\n\nKetik /help untuk melihat panduan lengkap cara menggunakan bot ini.');
        });

        // Middleware to setup AgentService per request
        this.bot.use(async (ctx: any, next) => {
            const userId = ctx.from?.id?.toString();
            if (userId) {
                const as = new AgentService();
                const activeWorkspaceId = await this.userSessionRepo.getActiveWorkspace(userId);
                as.setWorkspace(activeWorkspaceId || undefined);
                await as.init();
                ctx.agentService = as;
            }
            return next();
        });

        // Command: /workspace
        this.bot.command('workspace', async (ctx: any) => {
            const args = ctx.message.text.split(' ').slice(1);
            const cmd = args[0]?.toLowerCase();
            const userId = ctx.from.id.toString();
            
            if (cmd === 'list') {
                const workspaces = await this.workspaceRepo.getAll();
                if (workspaces.length === 0) {
                    await ctx.reply('Belum ada workspace. Buat dari Web Dashboard.');
                    return;
                }
                const activeId = await this.userSessionRepo.getActiveWorkspace(userId);
                const desc = workspaces.map((w, i) => {
                    const activeMark = w.id === activeId ? ' (Aktif ✅)' : '';
                    return `${i+1}. *${w.name}*${activeMark}`;
                }).join('\n');
                
                await ctx.reply(`📁 *Daftar Workspace*\n\n${desc}\n\nKetik \`/workspace switch <nama>\` untuk mengganti.`, { parse_mode: 'Markdown' });
                return;
            }
            
            if (cmd === 'switch') {
                const targetName = args.slice(1).join(' ').toLowerCase();
                if (!targetName) {
                    await ctx.reply('Mohon sertakan nama workspace. Contoh: `/workspace switch Laporan KP` atau `/workspace switch global`');
                    return;
                }
                if (targetName === 'global') {
                    await this.userSessionRepo.setActiveWorkspace(userId, null);
                    await ctx.reply('✅ Beralih ke Workspace *Global*.', { parse_mode: 'Markdown' });
                    return;
                }
                
                const workspaces = await this.workspaceRepo.getAll();
                const target = workspaces.find(w => w.name.toLowerCase() === targetName);
                
                if (!target) {
                    await ctx.reply(`❌ Workspace dengan nama *${targetName}* tidak ditemukan.`, { parse_mode: 'Markdown' });
                    return;
                }
                
                await this.userSessionRepo.setActiveWorkspace(userId, target.id);
                await ctx.reply(`✅ Berhasil beralih ke Workspace *${target.name}*.`, { parse_mode: 'Markdown' });
                return;
            }
            
            await ctx.reply('Perintah /workspace tersedia:\n- `/workspace list`\n- `/workspace switch <nama>`\n- `/workspace switch global`', { parse_mode: 'Markdown' });
        });

        // Command: /help
        this.bot.command('help', async (ctx) => {
            const msg = `🤖 *Panduan & Tutorial AI Document Assistant*\n\n` +
                        `*1. Membuat Dokumen Baru (/buat & /dbuat)*\n` +
                        `Ketik \`/buat <instruksi>\` untuk membuat dokumen atau Excel dari nol.\n` +
                        `_Contoh:_ \`/buatkan jadwal piket format excel\`\n\n` +
                        `*2. Menyimpan Ingatan Data (/ingat & /lupa)*\n` +
                        `Upload file Excel/Word atau kirim teks dengan caption \`/ingat\`. Bot akan menyimpan datanya. Gunakan \`/lupa\` untuk menghapus.\n\n` +
                        `*3. Menggunakan Template (/template)*\n` +
                        `- \`/template upload <kat>\`: Upload DOCX sebagai template.\n` +
                        `- \`/template list\`: Lihat daftar template.\n` +
                        `- \`/template pakai <nomor> <instruksi>\`: Pakai template tersimpan.\n\n` +
                        `*4. Chat Biasa (/chat & /dchat)*\n` +
                        `Ngobrol biasa dengan AI tanpa buat dokumen.\n\n` +
                        `*5. Auto-Fill Dokumen & Ekstrak Gambar*\n` +
                        `Upload DOCX (template placeholder \`{%nama}\`) + instruksi di caption:\n` +
                        `- Default menggunakan AI *Gemini*.\n` +
                        `- Tambahkan \`/deepseek\` di awal caption untuk *Deepseek*.\n` +
                        `_Catatan:_ Anda juga bisa menyertakan upload *gambar/foto* (di Discord) atau mendeskripsikan gambar, bot akan mengekstrak informasinya ke template.\n\n` +
                        `*6. Image Engine (/image)*\n` +
                        `Atur cara gambar ditempatkan di dokumen sebelum memproses.\n` +
                        `Contoh: \`/image mode fit_to_width\`, \`/image layout two_col\`, \`/image shadow on\`\n` +
                        `Ketik \`/image help\` untuk semua sub-perintah.`;
            
            await ctx.reply(msg, { parse_mode: 'Markdown' });
        });

        // ─── Command: /image ─────────────────────────────────────────────────────
        this.bot.command('image', async (ctx: any) => {
            const args   = ctx.message.text.split(' ').slice(1);
            const cmd    = (args[0] || 'help').toLowerCase();
            const userId = ctx.from.id.toString();

            const getCurrent = (): ImagePlacementOptions =>
                this.userImageSettings.get(userId) ?? {};

            const update = (patch: Partial<ImagePlacementOptions>) => {
                this.userImageSettings.set(userId, { ...getCurrent(), ...patch });
            };

            switch (cmd) {
                // /image mode <mode>
                case 'mode': {
                    const mode = args[1]?.toLowerCase() as PlacementMode;
                    if (!(PLACEMENT_MODES as readonly string[]).includes(mode)) {
                        await ctx.reply(`❌ Mode tidak valid.\nPilihan:\n${PLACEMENT_MODES.join(', ')}`);
                        return;
                    }
                    update({ mode });
                    await ctx.reply(`✅ Image mode: *${mode}*`, { parse_mode: 'Markdown' });
                    break;
                }

                // /image layout <type>
                case 'layout': {
                    const layout = args[1]?.toLowerCase() as LayoutType;
                    if (!(LAYOUT_TYPES as readonly string[]).includes(layout)) {
                        await ctx.reply(`❌ Layout tidak valid.\nPilihan: ${LAYOUT_TYPES.join(', ')}`);
                        return;
                    }
                    update({ layout });
                    await ctx.reply(`✅ Layout: *${layout}*`, { parse_mode: 'Markdown' });
                    break;
                }

                // /image crop <mode>
                case 'crop': {
                    const crop = args[1]?.toLowerCase() as CropMode;
                    if (!(CROP_MODES as readonly string[]).includes(crop)) {
                        await ctx.reply(`❌ Crop mode tidak valid.\nPilihan: ${CROP_MODES.join(', ')}`);
                        return;
                    }
                    update({ cropMode: crop });
                    await ctx.reply(`✅ Crop mode: *${crop}*`, { parse_mode: 'Markdown' });
                    break;
                }

                // /image border <width> [#color]
                case 'border': {
                    const bw    = parseInt(args[1] || '2');
                    const color = args[2] || '#000000';
                    update({ border: { width: isNaN(bw) ? 2 : bw, color } });
                    await ctx.reply(`✅ Border: ${bw}px warna \`${color}\``);
                    break;
                }

                // /image shadow on|off
                case 'shadow': {
                    const onOff = (args[1] || 'on').toLowerCase();
                    if (onOff === 'off') {
                        const { shadow: _, ...rest } = getCurrent();
                        this.userImageSettings.set(userId, rest);
                        await ctx.reply('✅ Shadow dinonaktifkan.');
                    } else {
                        update({ shadow: { offsetX: 4, offsetY: 4, blur: 4, color: '#000000', opacity: 0.4 } });
                        await ctx.reply('✅ Shadow diaktifkan (default: 4px, 40% opacity).');
                    }
                    break;
                }

                // /image watermark [opacity%]
                case 'watermark': {
                    const pct     = parseInt(args[1] || '25');
                    const opacity = (isNaN(pct) ? 25 : Math.min(100, Math.max(1, pct))) / 100;
                    update({ mode: 'watermark', opacity });
                    await ctx.reply(`✅ Watermark mode diaktifkan (${Math.round(opacity * 100)}% opacity).`);
                    break;
                }

                // /image caption on|off
                case 'caption': {
                    const onOff = (args[1] || 'on').toLowerCase();
                    update({ caption: onOff !== 'off' });
                    await ctx.reply(`✅ Caption otomatis: *${onOff !== 'off' ? 'Aktif ✅' : 'Nonaktif ❌'}*`, { parse_mode: 'Markdown' });
                    break;
                }

                // /image resize 75%   OR   /image resize 400x300
                case 'resize': {
                    const arg = args[1] || '100%';
                    if (arg.endsWith('%')) {
                        const pct = parseInt(arg);
                        update({ resize: { mode: 'percentage', percentage: isNaN(pct) ? 100 : pct } });
                        await ctx.reply(`✅ Resize: ${pct}%`);
                    } else if (arg.includes('x')) {
                        const [w, h] = arg.split('x').map(Number);
                        update({ resize: { mode: 'custom', width: w || 400, height: h || 300 } });
                        await ctx.reply(`✅ Resize: ${w}×${h}px`);
                    } else {
                        await ctx.reply('❌ Format tidak valid. Gunakan `75%` atau `400x300`.');
                    }
                    break;
                }

                // /image margin <all>  OR  <top> <right> <bottom> <left>
                case 'margin': {
                    const vals = args.slice(1).map(Number);
                    if (vals.length === 1) {
                        update({ margin: { top: vals[0], right: vals[0], bottom: vals[0], left: vals[0] } });
                        await ctx.reply(`✅ Margin: ${vals[0]}px`);
                    } else if (vals.length === 4) {
                        update({ margin: { top: vals[0], right: vals[1], bottom: vals[2], left: vals[3] } });
                        await ctx.reply(`✅ Margin: T${vals[0]} R${vals[1]} B${vals[2]} L${vals[3]}px`);
                    } else {
                        await ctx.reply('❌ Gunakan `/image margin 10` (semua sisi) atau `/image margin 5 10 5 10` (T R B L).');
                    }
                    break;
                }

                // /image status
                case 'status': {
                    const s = this.userImageSettings.get(userId);
                    if (!s || Object.keys(s).length === 0) {
                        await ctx.reply('ℹ️ Tidak ada pengaturan gambar aktif (menggunakan default).');
                        return;
                    }
                    const lines = Object.entries(s).map(([k, v]) => `• *${k}*: \`${JSON.stringify(v)}\``);
                    await ctx.reply(`⚙️ *Pengaturan Gambar Aktif*\n\n${lines.join('\n')}`, { parse_mode: 'Markdown' });
                    break;
                }

                // /image reset
                case 'reset': {
                    this.userImageSettings.delete(userId);
                    await ctx.reply('✅ Pengaturan gambar direset ke default.');
                    break;
                }

                // /image help (default)
                default: {
                    const modeList   = PLACEMENT_MODES.join(' | ');
                    const cropList   = CROP_MODES.join(' | ');
                    const layoutList = LAYOUT_TYPES.join(' | ');
                    await ctx.reply(
                        `🖼️ *Image Engine — Perintah*\n\n` +
                        `*/image mode \<mode\>*\n_${modeList}_\n\n` +
                        `*/image layout \<type\>*\n_${layoutList}_\n\n` +
                        `*/image crop \<mode\>*\n_${cropList}_\n\n` +
                        `*/image border \<px\> [\<#hex\>\]* — contoh: \`/image border 3 #FF0000\`\n\n` +
                        `*/image shadow on|off*\n\n` +
                        `*/image watermark [opacity%]* — contoh: \`/image watermark 30\`\n\n` +
                        `*/image caption on|off*\n\n` +
                        `*/image resize \<75%|400x300\>*\n\n` +
                        `*/image margin \<px\>* atau \`/image margin T R B L\`\n\n` +
                        `*/image status* — lihat pengaturan aktif\n` +
                        `*/image reset* — hapus semua pengaturan\n\n` +
                        `_Pengaturan berlaku untuk dokumen berikutnya yang memiliki placeholder gambar._`,
                        { parse_mode: 'Markdown' }
                    );
                    break;
                }
            }
        });

        // Command: /dashboard
        this.bot.command('dashboard', async (ctx) => {
            const templates = await ctx.agentService.templateRepo.getAll();
            const histories = await ctx.agentService.historyRepo.getAll();
            const today = new Date().setHours(0,0,0,0);
            const docsToday = histories.filter(h => h.generateDate >= today).length;
            
            const msg = `📊 *AI Agent Dashboard*\n\n` +
                        `Total Template: ${templates.length}\n` +
                        `Total Dokumen: ${histories.length}\n` +
                        `Dokumen Hari Ini: ${docsToday}`;
            await ctx.reply(msg, { parse_mode: 'Markdown' });
        });

        // ─── Template Registry Commands ──────────────────────────────────────────────
        this.bot.command('template', async (ctx) => {
            const list = await ctx.agentService.templateRepo.getAll();
            if (list.length === 0) {
                await ctx.reply('📂 Belum ada template yang disimpan. Gunakan `/save <nama>` dengan melampirkan file DOCX.', { parse_mode: 'Markdown' });
                return;
            }
            const msg = list.map((t: any, i: number) => `[${i + 1}] ${t.name} (ID: \`${t.id}\`) - Dipakai ${t.usageCount}x`).join('\n');
            await ctx.reply(`📂 *Daftar Template Tersimpan:*\n\n${msg}\n\nGunakan \`/use <nomor>\` untuk memilih template.`, { parse_mode: 'Markdown' });
        });

        this.bot.command('save', async (ctx: any) => {
            const name = ctx.message.text.split(' ').slice(1).join(' ').trim();
            if (!name) {
                await ctx.reply('❌ Format salah. Gunakan: `/save <nama_template>` (pastikan Anda melampirkan/membalas file DOCX)', { parse_mode: 'Markdown' });
                return;
            }
            
            let document = ctx.message.document;
            if (!document && ctx.message.reply_to_message && ctx.message.reply_to_message.document) {
                document = ctx.message.reply_to_message.document;
            }

            if (!document || !document.file_name?.toLowerCase().endsWith('.docx')) {
                await ctx.reply('❌ Anda harus melampirkan file DOCX bersama pesan ini (atau membalas lampiran DOCX).');
                return;
            }

            const processingMsg = await ctx.reply('⏳ Menyimpan template dan menganalisis field...');
            try {
                const fileLink = await ctx.telegram.getFileLink(document.file_id);
                const meta = await ctx.agentService.saveTemplate(fileLink.href, document.file_name || 'Template.docx', name);

                let replyText = `✅ Template *${meta.name}* berhasil disimpan secara permanen!\nID: \`${meta.id}\`\n\nGunakan \`/use ${meta.id}\` untuk mulai memakainya.`;

                // ── FEATURE 4: Show auto-detected fields ────────────────────────
                try {
                    const analysis = await ctx.agentService.smartMappingService.getAnalysis(meta.id);
                    if (analysis) {
                        const fieldSummary = ctx.agentService.smartMappingService.getAnalyzerService().formatFieldSummary(analysis);
                        replyText += `\n\n${fieldSummary}`;
                    }
                } catch (_) {}

                await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, undefined, replyText, { parse_mode: 'Markdown' });
            } catch (err: any) {
                await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, undefined, `❌ Gagal menyimpan template: ${err.message}`);
            }
        });

        this.bot.command('use', async (ctx: any) => {
            const arg = ctx.message.text.split(' ')[1];
            if (!arg) {
                await ctx.reply('❌ Format salah. Gunakan: `/use <nomor_urut>` atau `/use <ID>`', { parse_mode: 'Markdown' });
                return;
            }

            const list = await ctx.agentService.templateRepo.getAll();
            let templateId = arg;
            
            // Check if user passed index (e.g. 1, 2)
            const idx = parseInt(arg);
            if (!isNaN(idx) && idx > 0 && idx <= list.length) {
                templateId = list[idx - 1].id;
            }

            const targetTemplate = list.find((t: any) => t.id === templateId);
            if (!targetTemplate) {
                await ctx.reply('❌ Template tidak ditemukan.');
                return;
            }

            const userId = ctx.from.id.toString();
            try {
                ctx.agentService.templateManager.setActiveTemplate(userId, { type: 'registry', metadata: targetTemplate });
                await ctx.reply(`✅ Template *${targetTemplate.name}* sekarang AKTIF!\nSilakan kirimkan file Excel atau gambar untuk mulai Auto-Filling.`, { parse_mode: 'Markdown' });
            } catch (err: any) {
                await ctx.reply(`❌ ${err.message}`);
            }
        });

        this.bot.command('current', async (ctx) => {
            const userId = ctx.from.id.toString();
            const active = ctx.agentService.templateManager.getActiveTemplate(userId);
            if (!active) {
                await ctx.reply('ℹ️ Tidak ada template aktif. Gunakan `/template` lalu `/use <id>` untuk memilih, atau upload DOCX baru langsung.');
                return;
            }
            if (active.type === 'registry') {
                await ctx.reply(`✅ Template Aktif: *${active.metadata.name}*\nID: \`${active.metadata.id}\`\nKategori: ${active.metadata.category}`, { parse_mode: 'Markdown' });
            } else if (active.type === 'temporary') {
                await ctx.reply(`✅ Template Aktif (Sementara): *${require('path').basename(active.path)}*\nUpload DOCX lain untuk menggantinya.`, { parse_mode: 'Markdown' });
            }
        });

        // Command: /lupa
        this.bot.command('lupa', async (ctx) => {
            const userId = ctx.from.id.toString();
            await ctx.agentService.memoryRepo.clearMemory(userId);
            await ctx.reply('🧠 Ingatan referensi Anda telah dihapus.');
        });

        // Command: /ingat
        this.bot.command('ingat', async (ctx) => {
            const userId = ctx.from.id.toString();
            const memoryText = ctx.message.text.substring(6).trim();

            if (!memoryText) {
                await ctx.reply('Mohon berikan teks untuk diingat. Contoh: `/ingat data laporan keuangan bulan lalu`');
                return;
            }

            const processingMsg = await ctx.reply('Mengingat data referensi...');
            await ctx.agentService.memoryRepo.saveMemory(userId, memoryText);
            await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, undefined, '✅ Data berhasil diingat! Anda dapat menggunakannya saat menggunakan perintah `/buat` atau `/template pakai`.');
        });

        // Command: /lupatemplate
        this.bot.command('lupatemplate', async (ctx) => {
            const userId = ctx.from.id.toString();
            ctx.agentService.templateManager.clearActiveTemplate(userId);
            await ctx.reply('✅ Template aktif telah dilupakan. Anda sekarang berada di mode chat biasa.');
        });
        
        this.bot.command('forgettemplate', async (ctx) => {
            const userId = ctx.from.id.toString();
            ctx.agentService.templateManager.clearActiveTemplate(userId);
            await ctx.reply('✅ Template aktif telah dilupakan.');
        });

        // Command: /history
        this.bot.command('history', async (ctx) => {
            const userId = ctx.from.id.toString();
            const histories = await ctx.agentService.historyRepo.getByUserId(userId);
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
            const settings = await ctx.agentService.settingsRepo.get();
            const msg = `⚙️ *Pengaturan*\n\n` +
                        `Tema: ${settings.theme}\n` +
                        `Bahasa: ${settings.language}\n` +
                        `Auto Save: ${settings.autoSave ? 'Ya' : 'Tidak'}`;
            await ctx.reply(msg, { parse_mode: 'Markdown' });
        });

        // Chat Handler helper
        const handleChat = async (ctx: any, isDeepseek: boolean) => {
            const cmd = isDeepseek ? '/dchat' : '/chat';
            const text = ctx.message.text.replace(new RegExp(`^${cmd}`, 'i'), '').trim();
            const userId = ctx.from.id.toString();

            if (text === 'clear') {
                if (isDeepseek && ctx.agentService.deepseekService) {
                    ctx.agentService.deepseekService.clearChat(userId);
                } else {
                    ctx.agentService.geminiService.clearChat(userId);
                }
                await ctx.reply('Riwayat chat berhasil dihapus.');
                return;
            }
            if (!text) {
                await ctx.reply(`Ketik pesan untuk ngobrol. Contoh: \`${cmd} Halo\` atau \`${cmd} clear\` untuk reset.`);
                return;
            }
            
            const typingMsg = await ctx.reply('🤔 Berpikir...');
            try {
                const ai = isDeepseek && ctx.agentService.deepseekService ? ctx.agentService.deepseekService : ctx.agentService.geminiService;
                const reply = await ai.chat(userId, text);
                await ctx.telegram.editMessageText(ctx.chat.id, typingMsg.message_id, undefined, reply);
            } catch (e: any) {
                await ctx.telegram.editMessageText(ctx.chat.id, typingMsg.message_id, undefined, `❌ Gagal merespons: ${e.message}`);
            }
        };

        this.bot.command('chat', async (ctx) => handleChat(ctx, false));
        this.bot.command('dchat', async (ctx) => handleChat(ctx, true));

        const handleBuat = async (ctx: any, isDeepseek: boolean) => {
            const cmd = isDeepseek ? '/dbuat' : '/buat';
            const instruction = ctx.message.text.replace(new RegExp(`^${cmd}`, 'i'), '').trim();
            const userId = ctx.from.id.toString();
            const provider = isDeepseek ? 'deepseek' : 'gemini';

            if (!instruction) {
                await ctx.reply(`Mohon berikan instruksi. Contoh: \`${cmd} Buatkan laporan singkat\``);
                return;
            }

            const processingMsg = await ctx.reply(`🛠️ Membuat dokumen baru dari nol (${provider}), mohon tunggu...`);
            const startTime = Date.now();

            try {
                const memoryData = await ctx.agentService.memoryRepo.getByUserId(userId);
                const memoryContent = memoryData ? memoryData.content : undefined;

                const result = await ctx.agentService.generateDocumentFromScratch(instruction, userId, undefined, provider, memoryContent);
                
                await ctx.replyWithDocument({ source: result.documentPath });
                if (result.pdfPath) {
                    await ctx.replyWithDocument({ source: result.pdfPath });
                }

                // Save history
                await ctx.agentService.historyRepo.add({
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

                ctx.agentService.cleanupResults([result.documentPath, result.pdfPath]);
            } catch (error: any) {
                console.error(`Error handling ${cmd} command:`, error);
                await ctx.reply(`❌ Maaf, gagal membuat dokumen: ${error.message || 'Error internal.'}`);
            } finally {
                await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});
            }
        };

        this.bot.command('buat', async (ctx) => handleBuat(ctx, false));
        this.bot.command('dbuat', async (ctx) => handleBuat(ctx, true));

        this.bot.on(message('document'), async (ctx) => {
            try {
                const document = ctx.message.document;
                const caption = ctx.message.caption || '';
                const userId = ctx.from.id.toString();

                // 1) Memory upload via /ingat
                if (caption.toLowerCase().startsWith('!ingat') || caption.toLowerCase().startsWith('/ingat')) {
                    const processingMsg = await ctx.reply('Mengingat lampiran data referensi...');
                    let memoryText = caption.substring(6).trim();
                    const nameLower = document.file_name?.toLowerCase() || '';
                    
                    try {
                        const fileLink = await ctx.telegram.getFileLink(document.file_id);
                        const tempPath = await (ctx.agentService as any)['fileHandler'].downloadFile(fileLink.href, `temp_${userId}_${Date.now()}`);
                        
                        if (nameLower.endsWith('.xlsx')) {
                            const parsed = await ctx.agentService.excelParser.extractText(tempPath);
                            memoryText += `\n[Data dari Excel: ${document.file_name}]\n${parsed}`;
                        } else if (nameLower.endsWith('.docx')) {
                            const parsed = await (ctx.agentService as any)['docxParser'].extractText(tempPath);
                            memoryText += `\n[Data dari Dokumen: ${document.file_name}]\n${parsed}`;
                        }

                        (ctx.agentService as any)['fileHandler'].cleanupFile(tempPath);
                        await ctx.agentService.memoryRepo.saveMemory(userId, memoryText);
                        await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, undefined, '✅ Data berhasil diingat!');
                    } catch (e: any) {
                        await ctx.telegram.editMessageText(ctx.chat.id, processingMsg.message_id, undefined, `❌ Gagal mengingat: ${e.message}`);
                    }
                    return;
                }

                const nameLower = document.file_name?.toLowerCase() || '';
                const active = ctx.agentService.templateManager.getActiveTemplate(userId);

                // 2) DOCX - Set as Temporary Active Template (unless it's /save, handled by command handler)
                if (nameLower.endsWith('.docx')) {
                    const fileLink = await ctx.telegram.getFileLink(document.file_id);
                    const localPath = await (ctx.agentService as any)['fileHandler'].downloadFile(fileLink.href, `temp_template_${userId}_${Date.now()}.docx`);
                    await ctx.agentService.templateManager.setActiveTemplate(userId, { type: 'temporary', path: localPath, name: document.file_name || 'Template.docx' });
                    
                    if (!caption) {
                        await ctx.reply('✅ Template DOCX ini telah disetel menjadi template aktif (sementara)!\nSilakan kirimkan file Excel (.xlsx), ZIP (.zip), atau pesan teks/foto untuk mengisi template ini.\n\nGunakan `/save <nama>` jika ingin menyimpannya secara permanen.');
                        return;
                    }
                    
                    // If caption is present, process it like a text instruction
                    const processingMsg = await ctx.reply(`⏳ Memproses template dokumen Anda...`);
                    try {
                        const memoryData = await ctx.agentService.memoryRepo.getByUserId(userId);
                        const imageOptions = this.userImageSettings.get(userId);
                        const result = await ctx.agentService.processDocument(localPath, caption, userId, undefined, 'gemini', memoryData?.content, imageOptions);
                        
                        const fileName = document.file_name || 'Template.docx';
                        await ctx.replyWithDocument({ source: result.documentPath, filename: `Hasil_${fileName}` });
                        if (result.pdfPath) {
                            await ctx.replyWithDocument({ source: result.pdfPath, filename: `Hasil_${fileName.replace('.docx', '.pdf')}` });
                        }
                        ctx.agentService.cleanupResults([result.documentPath, result.pdfPath]);
                    } catch (e: any) {
                        await ctx.reply(`❌ Kesalahan: ${e.message}`);
                    } finally {
                        await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});
                    }
                    return;
                }

                // 3) Batch Processing (ZIP)
                if (nameLower.endsWith('.zip')) {
                    if (!active) {
                        await ctx.reply('❌ Anda harus memilih template terlebih dahulu menggunakan `/use <id>` atau mengirim template DOCX.');
                        return;
                    }

                    const initMsg = await ctx.reply('📥 Mengunduh file ZIP dan menyiapkan Batch Job...');
                    try {
                        const fileLink = await ctx.telegram.getFileLink(document.file_id);
                        const zipPath = await (ctx.agentService as any)['fileHandler'].downloadFile(fileLink.href, `upload_${userId}_${Date.now()}.zip`);
                        
                        const AdmZip = require('adm-zip');
                        const zip = new AdmZip(zipPath);
                        const extractDir = require('path').join(process.cwd(), 'storage', 'temp', `extracted_${Date.now()}`);
                        require('fs').mkdirSync(extractDir, { recursive: true });
                        zip.extractAllTo(extractDir, true);
                        
                        const fs = require('fs');
                        const path = require('path');
                        const files = fs.readdirSync(extractDir);
                        const excelFiles: string[] = [];
                        
                        for (const f of files) {
                            if (f.toLowerCase().endsWith('.xlsx') || f.toLowerCase().endsWith('.xls')) {
                                excelFiles.push(path.join(extractDir, f));
                            }
                        }

                        if (excelFiles.length === 0) {
                            await ctx.telegram.editMessageText(ctx.chat.id, initMsg.message_id, undefined, '❌ Tidak ditemukan file Excel di dalam ZIP.');
                            return;
                        }

                        const { JobManager } = require('../managers/jobManager');
                        const batchService = JobManager.getInstance().getBatchService();
                        const items = excelFiles.map((filePath: string) => ({ fileUrl: filePath, isLocal: true, filename: path.basename(filePath) }));

                        let templatePath = '';
                        if (active.type === 'registry') {
                            templatePath = active.metadata.filePath;
                        } else if (active.type === 'temporary') {
                            templatePath = active.path;
                        }

                        const job = await batchService.createBatchJob(userId, templatePath, items);
                        await ctx.telegram.editMessageText(ctx.chat.id, initMsg.message_id, undefined, `✅ **Batch Job Dibuat** (ID: \`${job.id}\`)\n\nAntrean sedang berjalan: ${job.items.length} file.\nSaya akan memberikan laporan ketika selesai!`, { parse_mode: 'Markdown' });

                        // Monitor job progress
                        const interval = setInterval(async () => {
                            const currentJob = await batchService.getRepo().getById(job.id);
                            if (!currentJob) { clearInterval(interval); return; }
                            
                            if (currentJob.status === 'completed') {
                                clearInterval(interval);
                                const summary = `✅ **Batch selesai diproses!**\n\nBerhasil: ${currentJob.successCount} file\nGagal: ${currentJob.failedCount} file\n\nDownload Link (Opsional):\n${require('../config/env').config.publicUrl}${currentJob.downloadUrl}`;
                                
                                const zipPath = require('path').join(process.cwd(), 'storage', 'downloads', `${currentJob.id}.zip`);
                                if (currentJob.zipSize && currentJob.zipSize < 50 * 1024 * 1024 && require('fs').existsSync(zipPath)) {
                                    try {
                                        await ctx.telegram.editMessageText(ctx.chat.id, initMsg.message_id, undefined, summary);
                                        await ctx.replyWithDocument({ source: zipPath, filename: `Batch_${currentJob.id}.zip` });
                                    } catch (e) {}
                                } else {
                                    try { await ctx.telegram.editMessageText(ctx.chat.id, initMsg.message_id, undefined, summary); } catch (e) {}
                                }
                            } else if (currentJob.status === 'processing') {
                                try { await ctx.telegram.editMessageText(ctx.chat.id, initMsg.message_id, undefined, `🔄 Processing... ${currentJob.successCount + currentJob.failedCount}/${currentJob.items.length} file`); } catch (e) {}
                            } else if (currentJob.status === 'failed') {
                                clearInterval(interval);
                                try { await ctx.telegram.editMessageText(ctx.chat.id, initMsg.message_id, undefined, `❌ Batch Job Gagal: ${currentJob.error}`); } catch (e) {}
                            }
                        }, 5000);

                    } catch (e: any) {
                        await ctx.telegram.editMessageText(ctx.chat.id, initMsg.message_id, undefined, `❌ Kesalahan memproses ZIP: ${e.message}`);
                    }
                    return;
                }

                // 4) Single Excel Auto Fill
                if (nameLower.endsWith('.xlsx') || nameLower.endsWith('.xls')) {
                    if (!active) {
                        await ctx.reply('❌ Anda harus memilih template terlebih dahulu menggunakan `/use <id>` atau mengirim template DOCX.');
                        return;
                    }

                    const processingMsg = await ctx.reply(`⏳ Mengunduh dan mengisi template dari Excel Anda...`);
                    try {
                        const fileLink = await ctx.telegram.getFileLink(document.file_id);
                        const localExcelPath = await (ctx.agentService as any)['fileHandler'].downloadFile(fileLink.href, `temp_${userId}_${Date.now()}.xlsx`);
                        const excelData = await ctx.agentService.excelParser.extractText(localExcelPath);
                        (ctx.agentService as any)['fileHandler'].cleanupFile(localExcelPath);

                        const memoryData = await ctx.agentService.memoryRepo.getByUserId(userId);
                        const imageOptions = this.userImageSettings.get(userId);
                        
                        let templatePath = '';
                        let tplName = document.file_name || 'Result';
                        if (active.type === 'registry') {
                            templatePath = active.metadata.filePath;
                            tplName = active.metadata.name;
                        } else if (active.type === 'temporary') {
                            templatePath = active.path;
                            tplName = active.name;
                        }

                        const result = await ctx.agentService.processDocument(templatePath, excelData, userId, undefined, 'gemini', memoryData?.content, imageOptions);
                        
                        await ctx.replyWithDocument({ source: result.documentPath, filename: `Hasil_${tplName}.docx` });
                        if (result.pdfPath) {
                            await ctx.replyWithDocument({ source: result.pdfPath, filename: `Hasil_${tplName}.pdf` });
                        }
                        ctx.agentService.cleanupResults([result.documentPath, result.pdfPath]);
                    } catch (e: any) {
                        await ctx.reply(`❌ Kesalahan: ${e.message}`);
                    } finally {
                        await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});
                    }
                    return;
                }

                await ctx.reply('Tipe dokumen tidak dikenali. Silakan upload DOCX (template), ZIP (batch), atau XLSX (single fill).');

            } catch (error: any) {
                console.error('Error handling document:', error);
                await ctx.reply(`❌ Maaf, terjadi kesalahan: ${error.message}`);
            }
        });

        this.bot.on(['text', 'photo'], async (ctx, next) => {
            const userId = ctx.from.id.toString();
            
            // Skip if it's a command
            if (ctx.message && 'text' in ctx.message && ctx.message.text.startsWith('/')) {
                return next();
            }

            const active = ctx.agentService.templateManager.getActiveTemplate(userId);
            if (!active) {
                return next();
            }

            let text = '';
            const imageUrls: string[] = [];

            if ('text' in ctx.message) {
                text = ctx.message.text;
            } else if ('photo' in ctx.message) {
                text = ctx.message.caption || '';
                // Get highest resolution photo
                const photo = ctx.message.photo[ctx.message.photo.length - 1];
                const fileLink = await ctx.telegram.getFileLink(photo.file_id);
                imageUrls.push(fileLink.href);
            }

            const processingMsg = await ctx.reply(`⏳ Mengisi template aktif Anda, mohon tunggu...`);
            const startTime = Date.now();

            try {
                const memoryData = await ctx.agentService.memoryRepo.getByUserId(userId);
                const memoryContent = memoryData ? memoryData.content : undefined;
                const imageOptions = this.userImageSettings.get(userId);

                let templatePath = '';
                let tplName = 'Template';
                if (active.type === 'registry') {
                    templatePath = active.metadata.filePath;
                    tplName = active.metadata.name;
                } else if (active.type === 'temporary') {
                    templatePath = active.path;
                    tplName = active.name;
                }

                const result = await ctx.agentService.processDocument(
                    templatePath,
                    text,
                    userId,
                    imageUrls.length > 0 ? imageUrls : undefined,
                    'gemini',
                    memoryContent,
                    imageOptions
                );

                await ctx.replyWithDocument({ source: result.documentPath, filename: `Hasil_${tplName}.docx` });
                if (result.pdfPath) {
                    await ctx.replyWithDocument({ source: result.pdfPath, filename: `Hasil_${tplName}.pdf` });
                }

                // Cleanup generated files
                ctx.agentService.cleanupResults([result.documentPath, result.pdfPath]);

            } catch (error: any) {
                console.error('Error handling active template chat:', error);
                await ctx.reply(`❌ Maaf, terjadi kesalahan: ${error.message || 'Gagal memproses dokumen.'}`);
            } finally {
                await ctx.telegram.deleteMessage(ctx.chat.id, processingMsg.message_id).catch(() => {});
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
