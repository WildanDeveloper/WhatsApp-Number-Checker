import { Markup } from 'telegraf';
import { bot } from './state.js';
import { REQUIRED_CHANNEL, REQUIRED_CHANNEL_LINK } from '../config.js';

const joinCache = new Map();

const OK_STATUS = new Set(['member', 'administrator', 'creator']);

export async function isChannelMember(userId, force = false) {
  const cached = joinCache.get(userId);
  if (!force && cached && Date.now() - cached.at < 60 * 1000) return cached.joined;

  try {
    const member = await bot.telegram.getChatMember(`@${REQUIRED_CHANNEL}`, userId);
    const joined = OK_STATUS.has(member.status);
    joinCache.set(userId, { joined, at: Date.now() });
    return joined;
  } catch (e) {
    const desc = e?.response?.description || e?.message || '';
    console.warn('Join check error:', desc);
    if (/chat not found|channel invalid|chat_id is invalid|peer id invalid/i.test(desc)) {
      console.warn('Join check: channel tidak bisa dicek, access dibuka');
      return true;
    }
    return cached?.joined ?? false;
  }
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
