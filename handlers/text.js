import fs from 'fs-extra';
import { bot, userSessions, userStates } from '../lib/state.js';
import { getUserMenu, getOwnerMenu, backBtn } from '../lib/menus.js';
import { esc, isOwner, quotaText } from '../lib/helpers.js';
import { useQuota, refundQuota, addQuota, getQuota, saveQuota, getAllUsers, logTraffic } from '../lib/database.js';
import { getActiveSocket, createBaileysSocket, getUserSessionDir } from '../lib/whatsapp.js';

export function registerTextHandler() {
  bot.on('text', async (ctx) => {
    if (!ctx.from || ctx.chat?.type !== 'private') return;
    const userId = ctx.from.id;
    const text = ctx.message.text.trim();
    const state = userStates.get(userId) || {};

    if (state.awaitingBroadcast) {
      if (!isOwner(userId)) return;
      const msg = ctx.message.text;
      const users = Object.keys(getAllUsers() || {});
      let sent = 0;
      let failed = 0;
      for (const id of users) {
        if (id === String(userId)) continue;
        try {
          await bot.telegram.sendMessage(id, `<b>📣 Broadcast:</b>\n\n${esc(msg)}`, { parse_mode: 'HTML' });
          sent++;
        } catch (e) {
          failed++;
        }
      }
      const result = `✅ <b>Broadcast selesai!</b>\n📤 Terkirim: ${sent}\n❌ Gagal: ${failed}`;
      if (state.instructionMsgId) {
        await bot.telegram.editMessageText(userId, state.instructionMsgId, undefined, result, { parse_mode: 'HTML', ...getOwnerMenu() });
      } else {
        await ctx.reply(result, { parse_mode: 'HTML', ...getOwnerMenu() });
      }
      userStates.delete(userId);
      return;
    }

    if (state.awaitingAddQuotaId) {
      if (!isOwner(userId)) return;
      const raw = text.trim();
      if (!/^\d+$/.test(raw)) {
        await bot.telegram.editMessageText(userId, state.instructionMsgId, undefined, '❌ <b>User ID tidak valid</b>\n\nMasukkan <b>User ID</b> yang mau ditambah kuotanya (hanya angka):', { parse_mode: 'HTML', ...backBtn() });
        return;
      }
      const targetId = raw;
      userStates.set(userId, { awaitingAddQuotaAmount: true, addQuotaTarget: targetId, instructionMsgId: state.instructionMsgId });
      await bot.telegram.editMessageText(userId, state.instructionMsgId, undefined, `➕ Berapa kuota tambahan untuk <code>${targetId}</code>? <b>(angka)</b>`, { parse_mode: 'HTML', ...backBtn() });
      return;
    }

    if (state.awaitingAddQuotaAmount) {
      if (!isOwner(userId)) return;
      const raw = text.trim();
      const amount = Number(raw);
      const targetId = state.addQuotaTarget;
      if (!/^\d+$/.test(raw) || !Number.isSafeInteger(amount) || amount <= 0) {
        await bot.telegram.editMessageText(userId, state.instructionMsgId, undefined, `❌ <b>Jumlah tidak valid</b>\n\nMasukkan angka untuk <code>${targetId}</code>:` , { parse_mode: 'HTML', ...backBtn() });
        return;
      }
      await addQuota(targetId, amount);
      const result = `✅ Kuota <code>${targetId}</code> ditambah <b>${amount}</b> nomor.`;
      if (state.instructionMsgId) {
        await bot.telegram.editMessageText(userId, state.instructionMsgId, undefined, result, { parse_mode: 'HTML', ...getOwnerMenu() });
      } else {
        await ctx.reply(result, { parse_mode: 'HTML', ...getOwnerMenu() });
      }
      userStates.delete(userId);
      return;
    }

    if (state.awaitingPhone) {
      const phone = text.replace(/\D/g, '');
      if (phone.length < 8) {
        await bot.telegram.editMessageText(userId, state.instructionMsgId, undefined, '❌ Nomor terlalu pendek. Masukkan nomor lengkap dengan kode negara (contoh: 628xxxxxxxxxx, 15551234567, 447xxx...)', { parse_mode: 'HTML', ...backBtn() });
        return;
      }

      await fs.remove(getUserSessionDir(userId));

      userStates.set(userId, { ...state, awaitingPhone: false, awaitingQR: true, phone, qrSent: false, pairingRequested: false });
      if (state.instructionMsgId) {
        await bot.telegram.editMessageText(userId, state.instructionMsgId, undefined, `🔄 Menghubungkan ke <b>${phone}</b>...\n🔗 Kode pairing akan dikirim sebentar...`, { parse_mode: 'HTML', ...backBtn() });
      } else {
        await ctx.reply(`🔄 Menghubungkan ke <b>${phone}</b>...\n🔗 Kode pairing akan dikirim sebentar...`, { parse_mode: 'HTML' });
      }

      await createBaileysSocket(userId);
      return;
    }

    if (state.awaitingManual) {
      const phone = text.replace(/\D/g, '');
      const del = async (msgId) => {
        try { if (msgId) await bot.telegram.deleteMessage(userId, msgId); } catch (e) {}
      };
      const send = async (txt, menu) => {
        const cur = userStates.get(userId);
        await del(cur?.instructionMsgId);
        const sent = await ctx.reply(txt, { parse_mode: 'HTML', ...(menu || backBtn()) });
        userStates.set(userId, { ...userStates.get(userId), awaitingManual: true, instructionMsgId: sent.message_id });
      };

      if (phone.length < 8) {
        await send('❌ Nomor terlalu pendek. Masukkan nomor lengkap dengan kode negara', backBtn());
        return;
      }

      const quota = useQuota(userId, 1);
      if (!quota.ok) {
        await del(state.instructionMsgId);
        const sent = await ctx.reply(`❌ <b>Kuota habis!</b>\n\n` + quotaText(userId), { parse_mode: 'HTML', ...getUserMenu(userId) });
        userStates.set(userId, { ...state, awaitingManual: false, instructionMsgId: sent.message_id });
        return;
      }

      const sock = getActiveSocket(userId);
      if (!sock) {
        refundQuota(userId, 1);
        await saveQuota();
        await send('❌ WhatsApp belum terhubung di server', backBtn());
        return;
      }

      await send(`🔍 Mengecek <b>${phone}</b>...`, backBtn());
      try {
        const [result] = await sock.onWhatsApp(phone);
        logTraffic(userId, 'manual', 1);
        await saveQuota();
        let hasil;
        if (result) {
          hasil = `✅ <b>${phone}</b> TERDAFTAR di WhatsApp\n🆔 JID: <code>${esc(result.jid)}</code>`;
        } else {
          hasil = `❌ <b>${phone}</b> BELUM TERDAFTAR di WhatsApp`;
        }
        hasil += `\n\n━━━━━━━━━━━━━\n📱 <i>Ketik nomor berikutnya untuk cek lagi...</i>\n◀️ Kembali untuk keluar`;
        await send(hasil, backBtn());
      } catch (e) {
        console.error('Check error:', e);
        refundQuota(userId, 1);
        await saveQuota();
        await send('❌ Error saat mengecek nomor', backBtn());
      }
      return;
    }
  });
}
