import fs from 'fs-extra';
import path from 'path';
import { Markup } from 'telegraf';
import { bot, userStates } from '../lib/state.js';
import { getUserMenu } from '../lib/menus.js';
import { useQuota, refundQuota, logTraffic, saveQuota } from '../lib/database.js';
import { getActiveSocket, getUserCheckDir } from '../lib/whatsapp.js';

export function registerDocumentHandler() {
  bot.on('document', async (ctx) => {
    if (!ctx.from || ctx.chat?.type !== 'private') return;
    const userId = ctx.from.id;
    const state = userStates.get(userId);

    if (!state?.awaitingFile) return;

    const doc = ctx.message.document;
    if (!doc.file_name || !doc.file_name.toLowerCase().endsWith('.txt')) {
      return ctx.reply('❌ Hanya file .txt yang didukung');
    }

    if (doc.file_size > 10 * 1024 * 1024) {
      return ctx.reply('❌ File terlalu besar (max 10MB)');
    }

    await ctx.reply('📥 Mendownload file...');

    let numbers = null;
    let quotaCharged = 0;
    let processed = 0;
    const errors = [];
    const registered = [];
    const unregistered = [];
    let progressMsg = null;
    const checkDir = getUserCheckDir(userId);
    const timestamp = Date.now();

    try {
      const fileLink = await bot.telegram.getFileLink(doc.file_id);
      const response = await fetch(fileLink.href);
      const content = await response.text();

      numbers = [...new Set(
        content
          .split(/[\n,;]+/)
          .map(l => l.replace(/[^\d]/g, ''))
          .filter(n => n.length >= 8 && n.length <= 15)
      )];

      if (numbers.length === 0) {
        return ctx.reply('❌ Tidak ada nomor valid di file (minimal 8 digit, maksimal 15 digit)');
      }

      const sock = getActiveSocket(userId);
      if (!sock) {
        userStates.set(userId, { ...userStates.get(userId), awaitingFile: false });
        return ctx.reply('❌ WhatsApp belum terhubung di server');
      }

      const quota = useQuota(userId, numbers.length);
      if (!quota.ok) {
        userStates.set(userId, { ...userStates.get(userId), awaitingFile: false });
        return ctx.reply(
          `❌ <b>Kuota tidak cukup!</b>\n\n` +
          `Butuh: <b>${numbers.length}</b> nomor\n` +
          `Sisa: <b>${quota.q.remaining}</b> nomor\n\n` +
          `💡 Kurangi jumlah nomor atau tunggu reset kuota.`,
          { parse_mode: 'HTML', ...getUserMenu(userId) }
        );
      }
      quotaCharged = numbers.length;

      progressMsg = await ctx.reply(`🔍 Memeriksa <b>${numbers.length}</b> nomor...`, Markup.inlineKeyboard([
        [Markup.button.callback('⏹ Batalkan Cek', 'cancel_check')]
      ]));

      userStates.set(userId, { ...userStates.get(userId), awaitingFile: false, checking: true, cancelCheck: false, progressMsgId: progressMsg.message_id });

      for (let i = 0; i < numbers.length; i++) {
        const currentState = userStates.get(userId);
        if (currentState?.cancelCheck) {
          try {
            await ctx.telegram.editMessageText(userId, currentState.progressMsgId, undefined, '⏹ Cek dibatalkan oleh user');
          } catch (e) {}
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
          const cur = userStates.get(userId);
          if (cur?.progressMsgId) {
            try {
              await ctx.telegram.editMessageText(userId, cur.progressMsgId, undefined,
                `⏳ <b>Progress:</b> ${i + 1}/${numbers.length}\n✅ Terdaftar: ${registered.length}\n❌ Belum: ${unregistered.length}\n⚠️ Error: ${errors.length}`,
                { parse_mode: 'HTML', ...Markup.inlineKeyboard([[Markup.button.callback('⏹ Batalkan Cek', 'cancel_check')]]) }
              );
            } catch (e) {}
          }
        }

        await new Promise(r => setTimeout(r, 500));
      }

      const refundCount = (quotaCharged - processed) + errors.length;
      if (refundCount > 0) refundQuota(userId, refundCount);
      logTraffic(userId, 'file', processed - errors.length);
      await saveQuota();

      const finalState = userStates.get(userId);
      if (!finalState?.cancelCheck) {
        await fs.ensureDir(checkDir);
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

        if (progressMsg) {
          try {
            await ctx.telegram.editMessageText(userId, progressMsg.message_id, undefined,
              `✅ <b>Selesai!</b> ✅ ${registered.length} · ❌ ${unregistered.length} · ⚠️ ${errors.length}`,
              { parse_mode: 'HTML' }
            );
          } catch (e) {}
        }
      }
    } catch (e) {
      console.error('File check error:', e);
      const refundCount = (quotaCharged - processed) + errors.length;
      if (refundCount > 0) refundQuota(userId, refundCount);
      try { await saveQuota(); } catch (e2) {}
      await ctx.reply('❌ Gagal memproses file');
    }

    const cur = userStates.get(userId) || {};
    userStates.set(userId, { ...cur, awaitingFile: false, checking: false, cancelCheck: false, progressMsgId: null });
  });
}
