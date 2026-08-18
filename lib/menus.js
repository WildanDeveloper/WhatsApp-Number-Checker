import { Markup } from 'telegraf';
import { isOwner } from './helpers.js';

export function getUserMenu(userId) {
  const isAdmin = isOwner(userId);
  const buttons = [];
  if (isAdmin) {
    buttons.push([Markup.button.callback('🔗 Hubungkan WhatsApp', 'connect_wa')]);
  }
  buttons.push([
    Markup.button.callback('📋 Cek Nomor (File)', 'check_file'),
    Markup.button.callback('📱 Cek Nomor (Manual)', 'check_manual'),
  ]);
  buttons.push([
    Markup.button.callback('🎟️ Kuota Saya', 'quota'),
    Markup.button.callback('🎁 Referral', 'referral'),
  ]);
  buttons.push([Markup.button.callback('📊 Traffic Request', 'traffic')]);
  if (isAdmin) {
    buttons.push([Markup.button.callback('📊 Status Koneksi', 'status'), Markup.button.callback('🔌 Putuskan Koneksi', 'disconnect')]);
    buttons.push([Markup.button.callback('⚙️ Panel Owner', 'owner_panel')]);
  }
  return Markup.inlineKeyboard(buttons);
}

export function getOwnerMenu() {
  return Markup.inlineKeyboard([
    [Markup.button.callback('📊 Statistik', 'owner_stats')],
    [Markup.button.callback('📣 Broadcast', 'owner_broadcast')],
    [Markup.button.callback('♻️ Reset Kuota Semua', 'owner_reset_quota')],
    [Markup.button.callback('➕ Tambah Kuota', 'owner_add_quota')],
    [Markup.button.callback('◀️ Kembali ke Menu', 'main_menu')],
  ]);
}

export function backBtn() {
  return Markup.inlineKeyboard([[Markup.button.callback('◀️ Kembali', 'main_menu')]]);
}
