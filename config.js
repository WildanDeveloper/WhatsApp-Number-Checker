import 'dotenv/config';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const BOT_TOKEN = process.env.BOT_TOKEN || 'YOUR_TELEGRAM_BOT_TOKEN';

const ADMIN_ID_RAW = (process.env.ADMIN_ID || '').trim();
export const ADMIN_ID = /^\d+$/.test(ADMIN_ID_RAW) ? parseInt(ADMIN_ID_RAW, 10) : null;
if (ADMIN_ID_RAW && ADMIN_ID === null) {
  console.warn('⚠️ ADMIN_ID tidak valid (harus angka) — fitur owner dinonaktifkan');
}

export const QUOTA_PER_DAY = 50;
export const QUOTA_RESET_HOURS = 24;
export const REFERRAL_REWARD = 20;

export const REQUIRED_CHANNEL = 'SentinelXecosystem';
export const REQUIRED_CHANNEL_LINK = 'https://t.me/SentinelXecosystem';

export const SESSIONS_DIR = path.join(__dirname, 'sessions');
export const CHECKS_DIR = path.join(__dirname, 'checks');
export const DATABASE_DIR = path.join(__dirname, 'database');
export const QUOTA_FILE = path.join(DATABASE_DIR, 'quota.json');
export const USERS_FILE = path.join(DATABASE_DIR, 'users.json');
export const PROXY_FILE = process.env.PROXY_FILE || path.join(__dirname, 'proxies.txt');
