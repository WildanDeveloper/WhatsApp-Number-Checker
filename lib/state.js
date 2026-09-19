import { Telegraf } from 'telegraf';
import { BOT_TOKEN } from '../config.js';

export const bot = new Telegraf(BOT_TOKEN);

export const userSessions = new Map();
export const userStates = new Map();

const FLOW_FLAGS = [
  'awaitingPhone',
  'awaitingManual',
  'awaitingFile',
  'awaitingBroadcast',
  'awaitingAddQuotaId',
  'awaitingAddQuotaAmount',
];

export function clearFlowState(userId) {
  const s = userStates.get(userId) || {};
  const next = { ...s };
  for (const f of FLOW_FLAGS) next[f] = false;
  next.addQuotaTarget = null;
  userStates.set(userId, next);
  return next;
}
