// Netlify-specific helpers: stores and VAPID keys (generated once, kept in Netlify Blobs).
import { getStore } from '@netlify/blobs';
import webpush from 'web-push';

export const stores = () => ({
  subs: getStore({ name: 'subs', consistency: 'strong' }),
  state: getStore({ name: 'state', consistency: 'strong' }),
  config: getStore({ name: 'config', consistency: 'strong' })
});

export async function vapidKeys() {
  const cfg = stores().config;
  let keys = await cfg.get('vapid', { type: 'json' });
  if (!keys) {
    keys = webpush.generateVAPIDKeys();
    await cfg.setJSON('vapid', keys);
  }
  return keys;
}

export async function sender(siteUrl) {
  const keys = await vapidKeys();
  webpush.setVapidDetails(siteUrl || 'https://englishman-river-parksville.netlify.app', keys.publicKey, keys.privateKey);
  return (subscription, payload) => webpush.sendNotification(subscription, payload, { TTL: 6 * 3600, urgency: 'high' });
}

export async function fetchJSON(url) {
  const r = await fetch(url, { headers: { 'user-agent': 'island-rivers-alerts' } });
  if (!r.ok) throw new Error('HTTP ' + r.status + ' for ' + url.split('?')[0]);
  const j = await r.json();
  if (j && j.error) throw new Error(j.error.message || 'service error');
  return j;
}

export const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
