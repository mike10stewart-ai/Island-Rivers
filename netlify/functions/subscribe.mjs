// POST /api/subscribe { subscription, rivers:[{id, mark, markName}] }
// An empty rivers list removes the subscription.
import { cleanSubscription, subKey } from '../../lib/core.mjs';
import { stores, json } from '../../lib/netlify.mjs';

export default async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405);
  let body;
  try { body = await req.json(); } catch { return json({ error: 'bad json' }, 400); }
  let clean;
  try { clean = cleanSubscription(body); } catch (e) { return json({ error: e.message }, 400); }
  const key = await subKey(clean.subscription.endpoint);
  const { subs } = stores();
  if (!clean.rivers.length) { await subs.delete(key); return json({ ok: true, rivers: 0 }); }
  const prev = await subs.get(key, { type: 'json' });
  await subs.setJSON(key, { subscription: clean.subscription, rivers: clean.rivers, created: prev?.created || Date.now(), notified: prev?.notified || {} });
  return json({ ok: true, rivers: clean.rivers.length });
};

export const config = { path: '/api/subscribe' };
