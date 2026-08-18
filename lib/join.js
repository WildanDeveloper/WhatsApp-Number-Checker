import { Markup } from 'telegraf';
import { bot } from './state.js';
import { REQUIRED_CHANNEL, REQUIRED_CHANNEL_LINK } from '../config.js';

const joinCache = new Map();

const OK_STATUS = new Set(['member', 'administrator', 'creator']);

export async function isChannelMember(userId, force = false) {
  const cached = joinCache.get(userId);
  if (!force && cached && Date.now() - cached.at < 60 * 1000) return cached.joined;

  let joined = false;
  try {
    const member = await bot.telegram.getChatMember(`@${REQUIRED_CHANNEL}`, userId);
    joined = OK_STATUS.has(member.status);
  } catch (e) {
    const code = e?.response?.error_code || e?.code;
    if (code === 400) {
      console.warn('Join check: channel tidak bisa dicek (400), access dibuka');
      joined = true;
    } else {
      joined = cached?.joined ?? false;
      console.error('Join check error:', e?.message);
    }
  }
  joinCache.set(userId, { joined, at: Date.now() });
  return joined;
}

export function joinMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.url('📢 Join Channel', REQUIRED_CHANNEL_LINK)],
    [Markup.button.callback('✅ Saya Sudah Join', 'verify_join')],
  ]);
}

export function joinRequiredText() {
  return (
    `⛔ <b>Akses Diblokir</b>\n\n` +
    `Untuk menggunakan bot ini, kamu wajib join channel kami dulu:\n\n` +
    `👉 <a href="${REQUIRED_CHANNEL_LINK}">${REQUIRED_CHANNEL}</a>\n\n` +
    `Setelah join, klik tombol <b>"✅ Saya Sudah Join"</b> di bawah.`
  );
}
