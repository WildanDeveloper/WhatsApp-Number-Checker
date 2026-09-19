import fs from 'fs-extra';
import path from 'path';
import { bot, userSessions, userStates } from '../lib/state.js';
import { getUserMenu, backBtn } from '../lib/menus.js';
import { esc, isOwner } from '../lib/helpers.js';
import { createBaileysSocket, getUserSessionDir, killSocket } from '../lib/whatsapp.js';

export function registerWaHandlers() {
  bot.action('connect_wa', async (ctx) => {
    const userId = ctx.from.id;
    if (!isOwner(userId)) return ctx.answerCbQuery('⛔ Khusus owner', { show_alert: true });
    const existing = userSessions.get(userId);
    const state = userStates.get(userId);

    if (existing && state?.connected) {
      return ctx.answerCbQuery('✅ Sudah terhubung!', { show_alert: true });
    }

    const sessionDir = getUserSessionDir(userId);
    const credsFile = path.join(sessionDir, 'creds.json');
    if (await fs.pathExists(credsFile)) {
      try {
        await ctx.answerCbQuery();
        await ctx.editMessageText('🔄 Memulihkan session tersimpan...');
        killSocket(userId);
        userStates.set(userId, {
          ...userStates.get(userId),
          connected: false,
          awaitingPhone: false,
          awaitingQR: false,
          awaitingPairing: false,
          pairingRequested: false,
          pairingCodeSent: false,
          pairingFailed: false,
          qrSent: false,
          reconnectAttempts: 0,
        });
        await createBaileysSocket(userId);
        await new Promise(r => setTimeout(r, 3000));
        const newState = userStates.get(userId);
        if (newState?.connected) {
          await ctx.editMessageText('✅ <b>Session dipulihkan!</b> WhatsApp terhubung.', { parse_mode: 'HTML', ...getUserMenu(userId) });
        } else {
          await ctx.editMessageText('⏳ Session dipulihkan, menunggu koneksi...', { parse_mode: 'HTML', ...getUserMenu(userId) });
        }
        return;
      } catch (e) {
        console.error('Restore failed:', e);
        await ctx.editMessageText('❌ Gagal memulihkan session: ' + esc(e.message), { parse_mode: 'HTML', ...backBtn() });
      }
    }

    await ctx.answerCbQuery();
    const sent = await ctx.editMessageText(
      '📱 Masukkan nomor WhatsApp <b>(format: 628xxxxxxxxxx)</b>:',
      { parse_mode: 'HTML', ...backBtn() }
    );
    userStates.set(userId, { ...userStates.get(userId), awaitingPhone: true, instructionMsgId: sent.message_id });
  });

  bot.action('disconnect', async (ctx) => {
    const userId = ctx.from.id;
    if (!isOwner(userId)) return ctx.answerCbQuery('⛔ Khusus owner', { show_alert: true });
    const sock = userSessions.get(userId);

    if (sock) {
      try {
        await Promise.race([sock.logout().catch(() => {}), new Promise(r => setTimeout(r, 10000))]);
      } catch (e) {
        console.error('Logout error:', e?.message);
      }
      killSocket(userId);
      await fs.remove(getUserSessionDir(userId));
      userStates.delete(userId);
      await ctx.answerCbQuery('✅ Terputus', { show_alert: true });
      await ctx.editMessageText('🔌 WhatsApp terputus. Klik "Hubungkan WhatsApp" untuk menghubungkan lagi.', { parse_mode: 'HTML', ...getUserMenu(userId) });
    } else {
      await ctx.answerCbQuery('Belum terhubung', { show_alert: true });
    }
  });

  bot.action('cancel_pairing', async (ctx) => {
    const userId = ctx.from.id;
    if (!isOwner(userId)) return ctx.answerCbQuery('⛔ Khusus owner', { show_alert: true });
    const state = userStates.get(userId) || {};

    if (state.awaitingQR || state.awaitingPairing || state.awaitingPhone || userSessions.has(userId)) {
      killSocket(userId);
      await fs.remove(getUserSessionDir(userId));
      userStates.set(userId, {
        ...state,
        awaitingQR: false,
        awaitingPhone: false,
        awaitingPairing: false,
        pairingRequested: false,
        pairingCodeSent: false,
        pairingFailed: false,
        qrSent: false,
        connected: false,
      });
      await ctx.answerCbQuery('❌ Pairing dibatalkan', { show_alert: true });
      await ctx.editMessageText('❌ Pairing dibatalkan. Klik "Hubungkan WhatsApp" untuk coba lagi.', { parse_mode: 'HTML', ...getUserMenu(userId) });
    } else {
      await ctx.answerCbQuery('Tidak ada proses pairing', { show_alert: true });
    }
  });
}
