// Runs every 15 minutes: checks advisories and marks for every followed river and sends alerts.
import { runCheck } from '../../lib/core.mjs';
import { stores, sender, fetchJSON } from '../../lib/netlify.mjs';

export default async () => {
  const s = stores();
  const send = await sender(process.env.URL);
  const result = await runCheck({ stores: { subs: s.subs, state: s.state }, fetchJSON, send, log: console.log });
  console.log('check-rivers', JSON.stringify(result));
};

export const config = { schedule: '*/15 * * * *' };
