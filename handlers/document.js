import fs from 'fs-extra';
import path from 'path';
import { Markup } from 'telegraf';
import { bot, userStates } from '../lib/state.js';
import { getUserMenu } from '../lib/menus.js';
import { useQuota, refundQuota, logTraffic, saveQuota } from '../lib/database.js';
import { getActiveSocket, getUserCheckDir } from '../lib/whatsapp.js';

export function registerDocumentHandler() {
  bot.on('document', async (ctx) => {
    const userId = ctx.from.id;
    const state = userStates.get(userId);

    if (!state?.awaitingFile) return;

    const doc = ctx.message.document;
    if (!doc.file_name.endsWith('.txt')) {
      return ctx.reply('❌ Hanya file .txt yang didukung');
    }

    if (doc.file_size > 10 * 1024 * 1024) {
      return ctx.reply('❌ File terlalu besar (max 10MB)');
    }

    await ctx.reply('📥 Mendownload file...');

    try {
      const fileLink = await bot.telegram.getFileLink(doc.file_id);
      const response = await fetch(fileLink.href);
      const content = await response.text();

      const numbers = content
        .split(/[\n,;]+/)
        .map(l => l.replace(/[^\d]/g, ''))
        .filter(n => n.length >= 8 && n.length <= 15);

      if (numbers.length === 0) {
        return ctx.reply('❌ Tidak ada nomor valid di file (minimal 8 digit, maksimal 15 digit)');
      }

      const sock = getActiveSocket(userId);
      if (!sock) {
        userStates.set(userId, { ...state, awaitingFile: false });
        return ctx.reply('❌ WhatsApp belum terhubung di server');
      }

      const quota = useQuota(userId, numbers.length);
      if (!quota.ok) {
        userStates.set(userId, { ...state, awaitingFile: false });
        return ctx.reply(
          `❌ <b>Kuota tidak cukup!</b>\n\n` +
          `Butuh: <b>${numbers.length}</b> nomor\n` +
          `Sisa: <b>${quota.q.remaining}</b> nomor\n\n` +
          `💡 Kurangi jumlah nomor atau tunggu reset kuota.`,
          { parse_mode: 'HTML', ...getUserMenu(userId) }
        );
      }

      const progressMsg = await ctx.reply(`🔍 Memeriksa <b>${numbers.length}</b> nomor...`, Markup.inlineKeyboard([
        [Markup.button.callback('⏹ Batalkan Cek', 'cancel_check')]
      ]));

      userStates.set(userId, { ...state, awaitingFile: true, checking: true, cancelCheck: false, progressMsgId: progressMsg.message_id });

      const registered = [];
      const unregistered = [];
      const errors = [];

      const checkDir = getUserCheckDir(userId);
      await fs.ensureDir(checkDir);
      const timestamp = Date.now();

      let processed = 0;
      for (let i = 0; i < numbers.length; i++) {
        const currentState = userStates.get(userId);
        if (currentState?.cancelCheck) {
          await ctx.telegram.editMessageText(userId, currentState.progressMsgId, undefined, '⏹ Cek dibatalkan oleh user');
          break;
        }

        const phone = numbers[i];
        processed++;
        try {
          const [result] = await sock.onWhatsApp(phone);
          if (result) {
            registered.push(phone);
          } else {
            unregistered.push(phone);
          }
        } catch (e) {
          errors.push(phone);
        }

        if ((i + 1) % 10 === 0 || i === numbers.length - 1) {
          const currentState = userStates.get(userId);
          if (currentState?.progressMsgId) {
            try {
              await ctx.telegram.editMessageText(userId, currentState.progressMsgId, undefined, 
                `⏳ <b>Progress:</b> ${i + 1}/${numbers.length}\n✅ Terdaftar: ${registered.length}\n❌ Belum: ${unregistered.length}\n⚠️ Error: ${errors.length}`,
                { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('⏹ Batalkan Cek', 'cancel_check')]]) }
              );
            } catch (e) {
            }
          }
        }

        await new Promise(r => setTimeout(r, 500));
      }

      const finalState = userStates.get(userId);
      if (finalState?.cancelCheck) {
        const remaining = numbers.length - processed;
        if (remaining > 0) {
          refundQuota(userId, remaining);
        }
        logTraffic(userId, 'file', processed);
        await saveQuota();
      } else {
        logTraffic(userId, 'file', processed);
        await saveQuota();

        const regFile = path.join(checkDir, `registered_${timestamp}.txt`);
        const unregFile = path.join(checkDir, `unregistered_${timestamp}.txt`);

        await fs.writeFile(regFile, registered.join('\n'));
        await fs.writeFile(unregFile, unregistered.join('\n'));

        await ctx.reply(
          `✅ <b>Selesai!</b>\n\n` +
          `📊 Total: <b>${numbers.length}</b>\n` +
          `✅ Terdaftar: <b>${registered.length}</b>\n` +
          `❌ Belum terdaftar: <b>${unregistered.length}</b>\n` +
          `⚠️ Error: <b>${errors.length}</b>`,
          { parse_mode: 'HTML' }
        );

        if (registered.length > 0) {
          await ctx.replyWithDocument({ source: regFile, filename: `registered_${timestamp}.txt` });
        }
        if (unregistered.length > 0) {
          await ctx.replyWithDocument({ source: unregFile, filename: `unregistered_${timestamp}.txt` });
        }
      }

    } catch (e) {
      console.error('File check error:', e);
      await ctx.reply('❌ Gagal memproses file');
    }

    userStates.set(userId, { ...state, awaitingFile: false, checking: false, cancelCheck: false });
  });
}
