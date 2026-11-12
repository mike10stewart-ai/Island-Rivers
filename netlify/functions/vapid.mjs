// GET /api/vapid -> the public key browsers need to subscribe to alerts.
import { vapidKeys, json } from '../../lib/netlify.mjs';

export default async () => {
  try { const k = await vapidKeys(); return json({ key: k.publicKey }); }
  catch (e) { return json({ error: 'alerts unavailable' }, 503); }
};

export const config = { path: '/api/vapid' };
