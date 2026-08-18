import fs from 'fs-extra';
import path from 'path';
import { bot, userStates } from './lib/state.js';
import { initDatabase } from './lib/database.js';
import { loadProxies } from './lib/proxy.js';
import { isChannelMember, joinMenu, joinRequiredText } from './lib/join.js';
import { isOwner } from './lib/helpers.js';
import { createBaileysSocket, getUserSessionDir } from './lib/whatsapp.js';
import { SESSIONS_DIR } from './config.js';
import { registerUserHandlers } from './handlers/user.js';
import { registerWaHandlers } from './handlers/wa.js';
import { registerOwnerHandlers } from './handlers/owner.js';
import { registerTextHandler } from './handlers/text.js';
import { registerDocumentHandler } from './handlers/document.js';

console.log('🤖 Bot starting...');

await initDatabase();
await loadProxies();

bot.use(async (ctx, next) => {
  if (ctx.from && !isOwner(ctx.from.id)) {
    const isCb = !!ctx.callbackQuery;
    if (!(isCb && ctx.callbackQuery.data === 'verify_join')) {
      const joined = await isChannelMember(ctx.from.id);
      if (!joined) {
        if (isCb) {
          return ctx.answerCbQuery('⛔ Join channel dulu ya!', { show_alert: true });
        }
        return ctx.reply(joinRequiredText(), { parse_mode: 'HTML', ...joinMenu() });
      }
    }
  }
  return next();
});

registerUserHandlers();
registerWaHandlers();
registerOwnerHandlers();
registerTextHandler();
registerDocumentHandler();

bot.action('cancel_check', async (ctx) => {
  const userId = ctx.from.id;
  const state = userStates.get(userId);

  if (state?.checking) {
    userStates.set(userId, { ...state, cancelCheck: true });
    await ctx.answerCbQuery('⏹ Membatalkan cek...', { show_alert: true });
  } else {
    await ctx.answerCbQuery('Tidak ada cek yang berjalan', { show_alert: true });
  }
});

bot.action('verify_join', async (ctx) => {
  const userId = ctx.from.id;
  const joined = await isChannelMember(userId, true);
  if (!joined) {
    return ctx.answerCbQuery('❌ Kamu belum join channel. Join dulu lalu klik lagi!', { show_alert: true });
  }
  await ctx.answerCbQuery('✅ Terverifikasi!');
  await ctx.editMessageText('✅ <b>Verifikasi berhasil!</b>\n\nSekarang kirim /start untuk lanjut pakai bot.', { parse_mode: 'HTML' });
});

bot.catch((err, ctx) => {
  console.error(`Error for ${ctx.updateType}:`, err);
});

bot.launch().then(() => {
  console.log('✅ Bot running');
  setTimeout(restoreSessions, 3000);
});

async function restoreSessions() {
  try {
    const dirs = await fs.readdir(SESSIONS_DIR);
    for (const dir of dirs) {
      const m = dir.match(/^user_(\d+)$/);
      if (!m) continue;
      const userId = parseInt(m[1]);
      if (!isOwner(userId)) continue;
      const credsFile = path.join(getUserSessionDir(userId), 'creds.json');
      if (!(await fs.pathExists(credsFile))) continue;
      const state = userStates.get(userId) || {};
      userStates.set(userId, { ...state, connected: false, restoring: true });
      console.log(`🔄 Auto-restoring WhatsApp session for user ${userId}...`);
      try {
        await createBaileysSocket(userId);
      } catch (e) {
        console.error(`Restore failed for user ${userId}:`, e?.message);
      }
    }
  } catch (e) {
    console.error('Restore sessions error:', e?.message);
  }
}

process.once('SIGINT', () => {
  bot.stop('SIGINT');
  setTimeout(() => process.exit(0), 2000);
});
process.once('SIGTERM', () => {
  bot.stop('SIGTERM');
  setTimeout(() => process.exit(0), 2000);
});
