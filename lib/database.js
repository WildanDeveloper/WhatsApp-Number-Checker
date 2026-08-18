import fs from 'fs-extra';
import path from 'path';
import { QUOTA_FILE, USERS_FILE, QUOTA_PER_DAY, QUOTA_RESET_HOURS, ADMIN_ID, REFERRAL_REWARD } from '../config.js';

export const isAdmin = (userId) => ADMIN_ID !== null && userId === ADMIN_ID;

let quotaDb = { users: {} };
let usersDb = { users: {} };

export async function initDatabase() {
  await fs.ensureDir(path.dirname(QUOTA_FILE));
  await fs.ensureDir(path.dirname(USERS_FILE));
  await Promise.all([loadQuota(), loadUsers()]);
}

async function loadQuota() {
  try {
    quotaDb = await fs.readJson(QUOTA_FILE);
  } catch (e) {
    quotaDb = { users: {} };
  }
}

async function loadUsers() {
  try {
    usersDb = await fs.readJson(USERS_FILE);
  } catch (e) {
    usersDb = { users: {} };
  }
}

let quotaWriteQueue = Promise.resolve();
let usersWriteQueue = Promise.resolve();

async function writeJsonAtomic(file, data) {
  const tmp = file + '.tmp';
  await fs.writeJson(tmp, data, { spaces: 2 });
  await fs.rename(tmp, file);
}

export function saveQuota() {
  const p = quotaWriteQueue.then(() => writeJsonAtomic(QUOTA_FILE, quotaDb));
  quotaWriteQueue = p.catch(() => {});
  return p;
}

export function saveUsers() {
  const p = usersWriteQueue.then(() => writeJsonAtomic(USERS_FILE, usersDb));
  usersWriteQueue = p.catch(() => {});
  return p;
}

export function getQuota(userId) {
  const now = Date.now();
  let u = quotaDb.users[userId] || { used: 0, lastReset: now, joinedAt: now, bonus: 0 };
  if (!u.lastReset) {
    u.lastReset = now;
  }
  if (now - u.lastReset >= QUOTA_RESET_HOURS * 3600 * 1000) {
    u.used = 0;
    u.lastReset = now;
  }
  u.bonus = u.bonus || 0;
  quotaDb.users[userId] = u;
  return {
    used: u.used,
    bonus: u.bonus,
    remaining: Math.max(0, QUOTA_PER_DAY + u.bonus - u.used),
    resetAt: u.lastReset + QUOTA_RESET_HOURS * 3600 * 1000,
  };
}

export function useQuota(userId, n = 1) {
  if (isAdmin(userId)) return { ok: true, unlimited: true, q: null };
  const q = getQuota(userId);
  if (q.remaining < n) return { ok: false, unlimited: false, q };
  quotaDb.users[userId].used += n;
  return { ok: true, unlimited: false, q };
}

export function refundQuota(userId, n = 1) {
  if (isAdmin(userId)) return;
  quotaDb.users[userId].used = Math.max(0, (quotaDb.users[userId].used || 0) - n);
}

export function registerUser(userId, username, refCode = null) {
  const existing = usersDb.users[userId];
  const isNew = !existing;
  getQuota(userId);
  usersDb.users[userId] = {
    id: userId,
    username: username || existing?.username || null,
    firstSeen: existing?.firstSeen || Date.now(),
    lastSeen: Date.now(),
    invitedBy: existing?.invitedBy || null,
  };

  if (isNew && refCode) {
    const referrerId = refCode.replace(/^ref_/, '');
    if (referrerId && String(referrerId) !== String(userId) && usersDb.users[referrerId]) {
      usersDb.users[userId].invitedBy = referrerId;
      addQuota(referrerId, REFERRAL_REWARD);
      return { isNew, referrerId };
    }
  }
  return { isNew, referrerId: null };
}

export function getReferralCode(userId) {
  return `ref_${userId}`;
}

export function countReferrals(userId) {
  const users = usersDb.users || {};
  return Object.values(users).filter((u) => u.invitedBy === String(userId)).length;
}

export function getInvitedBy(userId) {
  return usersDb.users[userId]?.invitedBy || null;
}

export function getAllUsers() {
  return usersDb.users;
}

export function getAllQuota() {
  return quotaDb.users;
}

export async function resetAllQuota() {
  const users = quotaDb.users || {};
  for (const id of Object.keys(users)) {
    users[id].used = 0;
    users[id].lastReset = Date.now();
  }
  await saveQuota();
}

export async function addQuota(userId, amount) {
  getQuota(userId);
  quotaDb.users[userId].bonus = (quotaDb.users[userId].bonus || 0) + amount;
  await saveQuota();
}

export function logTraffic(userId, type, count = 1) {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  let u = quotaDb.users[userId];
  if (!u) getQuota(userId);
  u = quotaDb.users[userId];
  u.traffic = u.traffic || {};
  const d = u.traffic[day] || { manual: 0, file: 0, numbers: 0 };
  if (type === 'manual') d.manual += 1;
  if (type === 'file') d.file += 1;
  d.numbers += type === 'manual' ? 1 : count;
  u.traffic[day] = d;
  const cutoff = new Date(now - 7 * 86400000).toISOString().slice(0, 10);
  for (const k of Object.keys(u.traffic)) {
    if (k < cutoff) delete u.traffic[k];
  }
  return d;
}

export function getTraffic(userId, days = 7) {
  const now = Date.now();
  const today = new Date(now).toISOString().slice(0, 10);
  const t = quotaDb.users[userId]?.traffic || {};
  const rows = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now - i * 86400000).toISOString().slice(0, 10);
    rows.push({ day: d, ...(t[d] || { manual: 0, file: 0, numbers: 0 }) });
  }
  return { today: t[today] || { manual: 0, file: 0, numbers: 0 }, rows };
}
