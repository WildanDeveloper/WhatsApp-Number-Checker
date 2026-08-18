import { ADMIN_ID, QUOTA_PER_DAY } from '../config.js';
import { getQuota } from './database.js';
export function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function isOwner(userId) {
  return ADMIN_ID !== null && userId === ADMIN_ID;
}

export function fmtNum(n) {
  return n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

export function fmtReset(ms) {
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return h > 0 ? `${h} jam ${m} mnt` : `${m} mnt`;
}

export function quotaBar(q) {
  const total = QUOTA_PER_DAY + (q.bonus || 0);
  if (total <= 0) return '▱'.repeat(10);
  const filled = Math.max(0, Math.min(10, Math.round((q.used / total) * 10)));
  return '▰'.repeat(filled) + '▱'.repeat(10 - filled);
}

export function quotaText(userId, title = '🎟️ <b>Kuota Saya</b>') {
  const q = getQuota(userId);
  const resetIn = fmtReset(Math.max(0, q.resetAt - Date.now()));
  const total = QUOTA_PER_DAY + q.bonus;
  return (
    `${title}\n\n` +
    `👤 User ID: <code>${userId}</code>\n` +
    `📊 Pemakaian: <code>${q.used}/${total}</code> nomor\n` +
    `${quotaBar(q)}\n` +
    `✅ Sisa: <b>${q.remaining}</b> nomor\n` +
    (q.bonus > 0 ? `🎁 Bonus: <b>+${q.bonus}</b>\n` : '') +
    `⏰ Reset otomatis dalam: <b>${resetIn}</b>\n\n` +
    (isOwner(userId) ? '👑 Owner: kuota unlimited\n' : '')
  );
}
