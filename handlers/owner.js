import { userStates } from '../lib/state.js';
import { getOwnerMenu, backBtn } from '../lib/menus.js';
import { esc, isOwner, fmtNum } from '../lib/helpers.js';
import { getAllUsers, getAllQuota, resetAllQuota } from '../lib/database.js';
import { QUOTA_PER_DAY } from '../config.js';

export function registerOwnerHandlers() {
  bot.action('owner_panel', async (ctx) => {
    const userId = ctx.from.id;
    if (!isOwner(userId)) return ctx.answerCbQuery('⛔ Khusus owner', { show_alert: true });
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `<b>⚙️ Panel Owner</b>\n\n` +
      `👤 <b>${esc(ctx.from.first_name || 'Owner')}</b>\n` +
      `🆔 <code>${userId}</code>\n\n` +
      `Pilih aksi:`,
      { parse_mode: 'HTML', ...getOwnerMenu() }
    );
  });

  bot.action('owner_stats', async (ctx) => {
    const userId = ctx.from.id;
    if (!isOwner(userId)) return ctx.answerCbQuery('⛔ Khusus owner', { show_alert: true });

    const users = getAllUsers();
    const quota = getAllQuota();
    const totalUsers = Object.keys(users).length;
    const totalUsed = Object.values(quota).reduce((s, u) => s + (u?.used || 0), 0);

    let lines = ['📊 <b>Statistik Bot</b>', '', `👥 Total User: <b>${totalUsers}</b>`, `📈 Total Cek Hari Ini: <b>${fmtNum(totalUsed)}</b>`, ''];
    const topUsers = Object.entries(quota)
      .sort((a, b) => (b[1]?.used || 0) - (a[1]?.used || 0))
      .slice(0, 10);
    if (topUsers.length > 0) {
      lines.push('🏆 <b>Top User:</b>');
      topUsers.forEach(([id, u], i) => {
        lines.push(`${i + 1}. <code>${id}</code> (${esc(users[id]?.username || '-')}) — ${u?.used || 0}/${QUOTA_PER_DAY}`);
      });
    }

    await ctx.answerCbQuery();
    await ctx.editMessageText(lines.join('\n'), { parse_mode: 'HTML', ...getOwnerMenu() });
  });

  bot.action('owner_broadcast', async (ctx) => {
    const userId = ctx.from.id;
    if (!isOwner(userId)) return ctx.answerCbQuery('⛔ Khusus owner', { show_alert: true });
    await ctx.answerCbQuery();
    const sent = await ctx.editMessageText('📣 <b>Broadcast</b>\n\nKirim pesan yang mau di-broadcast ke semua user:', { parse_mode: 'HTML', ...backBtn() });
    userStates.set(userId, { ...userStates.get(userId), awaitingBroadcast: true, instructionMsgId: sent.message_id });
  });

  bot.action('owner_reset_quota', async (ctx) => {
    const userId = ctx.from.id;
    if (!isOwner(userId)) return ctx.answerCbQuery('⛔ Khusus owner', { show_alert: true });

    await resetAllQuota();
    await ctx.answerCbQuery('♻️ Kuota semua user di-reset!', { show_alert: true });
    await ctx.editMessageText('♻️ <b>Kuota semua user sudah di-reset</b> ke penuh.', { parse_mode: 'HTML', ...getOwnerMenu() });
  });

  bot.action('owner_add_quota', async (ctx) => {
    const userId = ctx.from.id;
    if (!isOwner(userId)) return ctx.answerCbQuery('⛔ Khusus owner', { show_alert: true });
    await ctx.answerCbQuery();
    const sent = await ctx.editMessageText('➕ <b>Tambah Kuota</b>\n\nMasukkan <b>User ID</b> yang mau ditambah kuotanya:', { parse_mode: 'HTML', ...backBtn() });
    userStates.set(userId, { ...userStates.get(userId), awaitingAddQuotaId: true, instructionMsgId: sent.message_id });
  });
}
