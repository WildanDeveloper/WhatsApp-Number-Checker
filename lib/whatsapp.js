import path from 'path';
import fs from 'fs-extra';
import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import { Markup } from 'telegraf';
import { SESSIONS_DIR, CHECKS_DIR, ADMIN_ID } from '../config.js';
import { bot, userSessions, userStates } from './state.js';
import { isOwner } from './helpers.js';

export function getUserSessionDir(userId) {
  return path.join(SESSIONS_DIR, `user_${userId}`);
}

export function getUserCheckDir(userId) {
  return path.join(CHECKS_DIR, `user_${userId}`);
}

export function getActiveSocket(userId) {
  const targets = isOwner(userId) ? [userId] : [ADMIN_ID, userId];
  for (const id of targets) {
    if (id === null) continue;
    const sock = userSessions.get(id);
    const state = userStates.get(id);
    if (sock && state?.connected) return sock;
  }
  return null;
}

export async function createBaileysSocket(userId) {
  const existing = userSessions.get(userId);
  if (existing) {
    const st = userStates.get(userId);
    if (st?.connected) return existing;
    console.log(`User ${userId}: socket sudah ada, skip membuat duplikat`);
    return existing;
  }

  const sessionDir = getUserSessionDir(userId);
  await fs.ensureDir(sessionDir);

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const logger = pino({ level: 'silent' });

  const sock = makeWASocket({
    version,
    logger,
    auth: state,
    printQRInTerminal: false,
    browser: ['Ubuntu', 'Chrome', '20.0.04'],
    connectTimeoutMs: 30000,
    defaultQueryTimeoutMs: 30000,
    keepAliveIntervalMs: 20000,
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr, pairingCode } = update;

    const isRegistered = sock.authState.creds.registered;

    if (qr && !isRegistered) {
      const curState = userStates.get(userId) || {};
      if (curState.phone && !curState.pairingFailed) {
        console.log(`User ${userId}: pairing flow active, skip QR`);
        return;
      }
      if (curState.qrSent) {
        console.log(`User ${userId}: QR regenerated, skip (sudah terkirim)`);
        return;
      }
      console.log(`User ${userId}: QR Code received`);
      userStates.set(userId, { ...curState, qrSent: true });
      try {
        const qrImage = await QRCode.toBuffer(qr, { type: 'png', width: 300 });
        const cancelBtn = Markup.inlineKeyboard([Markup.button.callback('⏹ Batal Pairing', 'cancel_pairing')]);
        await bot.telegram.sendPhoto(userId, { source: qrImage }, {
          caption: '📱 <b>Scan QR Code di WhatsApp</b>\n\nWhatsApp &gt; Perangkat Tertaut &gt; Tautkan Perangkat &gt; Scan QR Code\n\nQR berlaku ~20 detik. Jika expired, klik "Hubungkan WhatsApp" lagi.',
          parse_mode: 'HTML',
          ...cancelBtn
        });
      } catch (e) {
        console.error('Failed to send QR:', e);
      }
    }

    if (pairingCode && !isRegistered) {
      console.log(`User ${userId}: Pairing code: ${pairingCode}`);
      const state = userStates.get(userId);
      if (state?.awaitingPairing) {
        state.pairingCode = pairingCode;
        if (state.pairingCodeSent) return;
        try {
          const formattedCode = pairingCode.slice(0, 4) + '-' + pairingCode.slice(4);
          await bot.telegram.sendMessage(userId, `🔗 <b>Kode Pairing WhatsApp:</b>\n<code>${formattedCode}</code>\n\nMasukkan kode ini di WhatsApp &gt; Perangkat Tertaut &gt; Tautkan Perangkat`, { parse_mode: 'HTML' });
        } catch (e) {
          console.error('Failed to send pairing code:', e);
        }
      }
    }

    if (connection === 'open') {
      console.log(`User ${userId}: Connected to WhatsApp`);
      userStates.set(userId, { ...userStates.get(userId), connected: true, awaitingPairing: false, reconnectAttempts: 0, qrSent: false });
      try {
        await bot.telegram.sendMessage(userId, '✅ <b>WhatsApp Terhubung!</b>\nSekarang Anda bisa mengecek nomor.', { parse_mode: 'HTML' });
      } catch (e) {}
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      const isLoggedOut = reason === DisconnectReason.loggedOut;
      
      console.log(`User ${userId}: Connection closed, reason: ${reason}`);

      userSessions.delete(userId);

      if (isLoggedOut) {
        console.log(`User ${userId}: Logged out, clearing session`);
        await fs.remove(sessionDir);
        userStates.delete(userId);
        return;
      }

      if (userStates.get(userId)?.cancelPairing) {
        console.log(`User ${userId}: Pairing cancelled, skipping reconnect`);
        userStates.delete(userId);
        return;
      }

      userStates.set(userId, { ...userStates.get(userId), connected: false, qrSent: false });

      const attempts = (userStates.get(userId)?.reconnectAttempts || 0) + 1;
      userStates.set(userId, { ...userStates.get(userId), reconnectAttempts: attempts });

      if (attempts > 5) {
        console.log(`User ${userId}: Max reconnect attempts reached`);
        await fs.remove(sessionDir);
        userStates.delete(userId);
        return;
      }

      let delay = 5000;
      if (reason === DisconnectReason.restartRequired) {
        console.log(`User ${userId}: Restart required (515), cooling down 15s...`);
        delay = 15000;
      } else if (reason === DisconnectReason.forbidden) {
        console.log(`User ${userId}: Forbidden (403), cooling down 30s...`);
        delay = 30000;
      } else {
        delay = 5000 * attempts;
      }

      console.log(`User ${userId}: Reconnecting in ${delay/1000}s (attempt ${attempts}/5)`);
      setTimeout(() => {
        const st = userStates.get(userId);
        if (!st || st.cancelPairing || st.connected) return;
        createBaileysSocket(userId);
      }, delay);
    }
  });

  const userState = userStates.get(userId) || {};
  if (!sock.authState.creds.registered && userState?.phone && !userState.pairingRequested) {
    userStates.set(userId, { ...userState, pairingRequested: true });
    try {
      await new Promise(r => setTimeout(r, 4000));
      const code = await sock.requestPairingCode(userState.phone);
      console.log(`Pairing code for ${userId}: ${code}`);

      const formattedCode = code.slice(0, 4) + '-' + code.slice(4);
      await bot.telegram.sendMessage(userId,
        `🔗 <b>Kode Pairing WhatsApp:</b>\n<code>${formattedCode}</code>\n\n` +
        `Masukkan kode ini di WhatsApp &gt; Perangkat Tertaut &gt; Tautkan Perangkat\n` +
        `Format: <code>${formattedCode}</code> (tanpa strip juga bisa)`,
        { parse_mode: 'HTML' }
      );
      userStates.set(userId, { ...userStates.get(userId), awaitingPhone: false, awaitingPairing: true, pairingCodeSent: true });
    } catch (e) {
      console.error('Pairing error:', e);
      await bot.telegram.sendMessage(userId, '❌ Gagal meminta pairing code: ' + (e?.message || e) + '\n\n📱 QR Code akan dikirim sebagai alternatif.');
      userStates.set(userId, { ...userStates.get(userId), awaitingPhone: false, awaitingPairing: false, pairingFailed: true });
    }
  }

  userSessions.set(userId, sock);
  return sock;
}
