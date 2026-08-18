import fs from 'fs-extra';
import { PROXY_FILE } from '../config.js';

let proxyList = [];

export async function loadProxies() {
  try {
    const content = await fs.readFile(PROXY_FILE, 'utf-8');
    proxyList = content.split('\n').map(l => l.trim()).filter(l => l);
    console.log(`Loaded ${proxyList.length} proxies`);
  } catch (e) {
    console.warn('Proxy file not found, running without proxy');
    proxyList = [];
  }
}

export function getProxyList() {
  return proxyList;
}