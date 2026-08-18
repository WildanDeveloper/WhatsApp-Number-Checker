import { Telegraf, session } from 'telegraf';
import { BOT_TOKEN } from '../config.js';

export const bot = new Telegraf(BOT_TOKEN);

export const userSessions = new Map();
export const userStates = new Map();

bot.use(session());