import { bot, userStates, clearFlowState } from '../lib/state.js';
import { getUserMenu, backBtn } from '../lib/menus.js';
import { esc, isOwner, quotaText, fmtNum } from '../lib/helpers.js';
import { registerUser, saveUsers, saveQuota, getReferralCode, countReferrals, getTraffic } from '../lib/database.js';
import { getActiveSocket } from '../lib/whatsapp.js';
import { QUOTA_PER_DAY, REFERRAL_REWARD } from '../config.js';

export function registerUserHandlers() {
  bot.start(async (ctx) => {
    const userId = ctx.from.id;
    const username = ctx.from.username || null;
    const refCode = ctx.startPayload || null;
    const { isNew, referrerId } = await registerUser(userId, username, refCode);
    await Promise.all([saveUsers(), saveQuota()]);
    clearFlowState(userId);

    const isAdmin = isOwner(userId);
    const refLine = isNew && referrerId
      ? `\n🎁 Kamu join lewat referral <code>${referrerId}</code>\n`
      : '';
    const features = isAdmin
      ? `• 🔗 Hubungkan WhatsApp (QR)\n` +
        `• 📋 Cek nomor terdaftar WhatsApp (bulk/file)\n` +
        `• 📱 Cek nomor manual\n` +
        `• 🎁 Referral: undang teman, dapat ${REFERRAL_REWARD} limit per orang\n`
      : `• 📋 Cek nomor terdaftar WhatsApp (bulk/file)\n` +
        `• 📱 Cek nomor manual\n` +
        `• 🎁 Referral: undang teman, dapat ${REFERRAL_REWARD} limit per orang\n`;
    await ctx.reply(
      `<b>👋 Halo ${esc(ctx.from.first_name || 'Pengguna')}!</b>\n\n` +
      `Selamat datang di <b>Nokos Checker Bot</b> 🚀\n\n` +
      `Fitur:\n` +
      features +
      refLine +
      (isAdmin
        ? `\n👑 <b>Panel Owner</b> aktif - Anda punya kuota unlimited\n`
        : `\n🎟️ Kuota gratis <b>${QUOTA_PER_DAY} nomor/hari</b>, reset otomatis tiap 24 jam\n`) +
      `\nPilih menu di bawah:`,
      { parse_mode: 'HTML', ...getUserMenu(userId) }
    );
  });

  bot.action('main_menu', async (ctx) => {
    const userId = ctx.from.id;
    clearFlowState(userId);
    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `<b>🏠 Menu Utama</b>\n\n` + quotaText(userId),
      { parse_mode: 'HTML', ...getUserMenu(userId) }
    );
  });

  bot.action('quota', async (ctx) => {
    const userId = ctx.from.id;
    await ctx.answerCbQuery();
    await ctx.editMessageText(quotaText(userId), { parse_mode: 'HTML', ...getUserMenu(userId) });
  });

  bot.action('traffic', async (ctx) => {
    const userId = ctx.from.id;
    await ctx.answerCbQuery();
    const { today, rows } = getTraffic(userId, 7);
    const lines = rows.map((r) => {
      const date = r.day.split('-').reverse().join('/');
      return (
        `• <code>${date}</code> — 📱 <b>${r.manual}</b> manual · 📁 <b>${r.file}</b> file · 🔢 <b>${fmtNum(r.numbers)}</b> nomor`
      );
    });
    await ctx.editMessageText(
      `📊 <b>Traffic Request</b>\n\n` +
      `📊 Hari ini: <b>${fmtNum(today.numbers)}</b> nomor dicek\n` +
      `📱 Manual: <b>${today.manual}</b> request\n` +
      `📁 File: <b>${today.file}</b> request\n\n` +
      `📅 <b>7 hari terakhir:</b>\n` +
      lines.join('\n') +
      `\n\n<i>Terhitung otomatis setiap request cek nomor.</i>`,
      { parse_mode: 'HTML', ...backBtn() }
    );
  });

  bot.action('status', async (ctx) => {
    const userId = ctx.from.id;
    if (!isOwner(userId)) return ctx.answerCbQuery('⛔ Khusus owner', { show_alert: true });
    const state = userStates.get(userId);
    const connected = state?.connected || false;

    await ctx.answerCbQuery();
    await ctx.editMessageText(
      `📊 <b>Status Koneksi</b>\n\n` +
      `WhatsApp: ${connected ? '✅ <b>Terhubung</b>' : '❌ <b>Terputus</b>'}\n` +
      `Session: ${connected ? '🟢 Aktif' : '⚫ Tidak ada'}\n\n` +
      `👤 User ID: <code>${userId}</code>`,
      { parse_mode: 'HTML', ...getUserMenu(userId) }
    );
  });

  bot.action('check_file', async (ctx) => {
    const userId = ctx.from.id;
    const state = userStates.get(userId);

    if (!getActiveSocket(userId)) {
      return ctx.answerCbQuery('❌ WhatsApp belum terhubung!', { show_alert: true });
    }

    await ctx.answerCbQuery();
    const sent = await ctx.editMessageText(
      '📁 <b>Cek Nomor (File)</b>\n\n' +
      'Kirim file <code>.txt</code> berisi daftar nomor.\n\n' +
      '<b>Format fleksibel:</b> boleh campur aduk — pakai <code>+62</code>, tanda <code>-</code>, spasi, atau pisah pakai koma/baris baru.\n' +
      'Karakter <code>+</code>, <code>-</code>, spasi dihapus otomatis.\n\n' +
      '<b>Contoh isi file (semua berhasil):</b>\n' +
      '<code>+6212345678\n612986284728\n+62-816-2739-62837\n62-6183-6283-2732\n62 2648 2648 2748</code>',
      { parse_mode: 'HTML', ...backBtn() }
    );
    userStates.set(userId, { ...state, awaitingFile: true, instructionMsgId: sent.message_id });
  });

  bot.action('check_manual', async (ctx) => {
    const userId = ctx.from.id;
    const state = userStates.get(userId);

    if (!getActiveSocket(userId)) {
      return ctx.answerCbQuery('❌ WhatsApp belum terhubung!', { show_alert: true });
    }

    await ctx.answerCbQuery();
    const sent = await ctx.reply(
      '📱 <b>Cek Nomor (Manual)</b>\n\n' +
      'Masukkan nomor <b>(format: 628xxxxxxxxxx)</b>.\n\n' +
      '<b>MODE CONTINUOUS:</b> setelah cek selesai, langsung ketik nomor berikutnya — tanpa pencet tombol lagi.\n' +
      'Klik <b>"◀️ Kembali"</b> untuk keluar dari mode ini.',
      { parse_mode: 'HTML', ...backBtn() }
    );
    userStates.set(userId, { ...state, awaitingManual: true, instructionMsgId: sent.message_id });
  });

  bot.action('referral', async (ctx) => {
    const userId = ctx.from.id;
    await ctx.answerCbQuery();
    const code = getReferralCode(userId);
    const botInfo = ctx.botInfo?.username || (await bot.telegram.getMe()).username;
    const link = `https://t.me/${botInfo}?start=${code}`;
    const invited = countReferrals(userId);
    await ctx.editMessageText(
      `🎁 <b>Referral Program</b>\n\n` +
      `Undang teman pakai link kamu, setiap 1 teman join kamu dapat <b>+${REFERRAL_REWARD} limit</b> permanen!\n\n` +
      `🔗 <b>Link kamu:</b>\n<code>${link}</code>\n\n` +
      `👥 Sudah mengundang: <b>${invited} orang</b>\n` +
      `💰 Total bonus: <b>+${invited * REFERRAL_REWARD} limit</b>\n\n` +
      `Cara pakai:\n` +
      `1️⃣ Kirim link di atas ke teman\n` +
      `2️⃣ Teman tekan /start lewat link itu\n` +
      `3️⃣ Limit bonus langsung masuk ke akun kamu`,
      { parse_mode: 'HTML', ...backBtn() }
    );
  });
}
