// Shared logic for Island Rivers push alerts.
// Kept free of Netlify specifics so it can be tested with plain objects.

export const RIVER_ID = /^08H[A-F]\d{3}$/;
const AGO = 'https://services6.arcgis.com/ubm4tcTYICKBpist/arcgis/rest/services/';
const ADV_NAMES = { 2: 'High Streamflow Advisory', 3: 'Flood Watch', 4: 'Flood Warning' };

export function prettyName(s) {
  const small = new Set(['near', 'at', 'below', 'above', 'of', 'the', 'and']);
  return String(s || '').toLowerCase().split(' ')
    .map((w, i) => (i && small.has(w)) ? w : w.replace(/^./, c => c.toUpperCase())).join(' ');
}

// Validate and normalise what the browser sends.
export function cleanSubscription(body) {
  const sub = body && body.subscription;
  if (!sub || typeof sub.endpoint !== 'string' || !/^https:\/\//.test(sub.endpoint)) throw new Error('bad subscription');
  if (!sub.keys || typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string') throw new Error('bad keys');
  const rivers = Array.isArray(body.rivers) ? body.rivers : [];
  const clean = [];
  for (const r of rivers.slice(0, 20)) {
    if (!r || !RIVER_ID.test(r.id)) continue;
    const mark = Number(r.mark);
    clean.push({
      id: r.id,
      mark: Number.isFinite(mark) ? mark : null,
      markName: typeof r.markName === 'string' ? r.markName.slice(0, 40) : null
    });
  }
  return { subscription: { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } }, rivers: clean };
}

export async function subKey(endpoint) {
  const data = new TextEncoder().encode(endpoint);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ---- data lookups (fetchJSON is injected so tests can fake it) ----
export async function latestReading(fetchJSON, id) {
  const since = new Date(Date.now() - 6 * 3600e3).toISOString().slice(0, 19) + 'Z';
  const j = await fetchJSON('https://api.weather.gc.ca/collections/hydrometric-realtime/items?f=json&limit=1&skipGeometry=true&properties=DATETIME,LEVEL,DISCHARGE&sortby=-DATETIME&STATION_NUMBER=' + id + '&datetime=' + since + '/..');
  const p = j && j.features && j.features[0] && j.features[0].properties;
  return p && p.LEVEL != null ? { time: p.DATETIME, level: +p.LEVEL, flow: p.DISCHARGE == null ? null : +p.DISCHARGE } : null;
}

export async function stationInfo(fetchJSON, id) {
  const j = await fetchJSON('https://api.weather.gc.ca/collections/hydrometric-stations/items?f=json&STATION_NUMBER=' + id);
  const f = j && j.features && j.features[0];
  if (!f) return null;
  return { name: prettyName(f.properties.STATION_NAME), lon: f.geometry.coordinates[0], lat: f.geometry.coordinates[1] };
}

export async function advisoryAt(fetchJSON, lon, lat) {
  const params = new URLSearchParams({
    geometry: lon + ',' + lat, geometryType: 'esriGeometryPoint', inSR: '4326', spatialRel: 'esriSpatialRelIntersects',
    outFields: 'Advisory,Major_Basin,Sub_Basin,Comments', returnGeometry: 'false', f: 'json'
  });
  const j = await fetchJSON(AGO + 'BC_Flood_Advisory_and_Warning_Notifications_(Public_View)/FeatureServer/0/query?' + params);
  let best = null;
  for (const f of (j && j.features) || []) { const a = f.attributes; if (!best || (a.Advisory || 0) > (best.Advisory || 0)) best = a; }
  return best ? { level: best.Advisory || 1, area: best.Sub_Basin || best.Major_Basin || '', url: /^https?:\/\//.test(best.Comments || '') ? best.Comments.replace(/^http:/, 'https:') : null } : { level: 1, area: '', url: null };
}

// ---- the check ----
// stores: { subs, state } each with get(key,{type:'json'}), setJSON, delete, list()
// send(subscription, payload) -> resolves, or rejects with {statusCode}
export async function runCheck({ stores, fetchJSON, send, log = () => {} }) {
  const { blobs } = await stores.subs.list();
  const subs = [];
  for (const b of blobs) {
    const s = await stores.subs.get(b.key, { type: 'json' });
    if (s && s.rivers && s.rivers.length) subs.push({ key: b.key, ...s });
  }
  const ids = [...new Set(subs.flatMap(s => s.rivers.map(r => r.id)))];
  const rivers = {};
  for (const id of ids) {
    try {
      let info = await stores.state.get('info-' + id, { type: 'json' });
      if (!info) { info = await stationInfo(fetchJSON, id); if (info) await stores.state.setJSON('info-' + id, info); }
      if (!info) continue;
      const [reading, adv] = await Promise.all([
        latestReading(fetchJSON, id).catch(() => null),
        advisoryAt(fetchJSON, info.lon, info.lat).catch(() => null)
      ]);
      const prev = (await stores.state.get('adv-' + id, { type: 'json' })) || { level: 1 };
      let advEvent = null;
      if (adv) {
        if (adv.level > prev.level && adv.level >= 2) advEvent = { kind: 'up', adv };
        else if (adv.level < prev.level && prev.level >= 2) advEvent = { kind: 'down', adv, prev };
        if (adv.level !== prev.level) await stores.state.setJSON('adv-' + id, { level: adv.level, at: Date.now() });
      }
      rivers[id] = { info, reading, adv, advEvent };
    } catch (e) { log('river ' + id + ' failed: ' + e.message); }
  }

  let sent = 0, removed = 0;
  for (const s of subs) {
    const notified = { ...(s.notified || {}) };
    const messages = [];
    for (const r of s.rivers) {
      const R = rivers[r.id]; if (!R) continue;
      const name = R.info.name;
      if (R.advEvent && R.advEvent.kind === 'up') {
        messages.push({ title: ADV_NAMES[R.advEvent.adv.level] + ': ' + (R.advEvent.adv.area || name), body: 'The BC River Forecast Centre has issued a ' + ADV_NAMES[R.advEvent.adv.level] + ' covering ' + name + '.', url: '/#' + r.id });
      } else if (R.advEvent && R.advEvent.kind === 'down') {
        messages.push({ title: 'Advisory eased: ' + (R.advEvent.adv.area || name), body: R.advEvent.adv.level >= 2 ? 'Now a ' + ADV_NAMES[R.advEvent.adv.level] + ' for ' + name + '.' : 'No River Forecast Centre advisory now covers ' + name + '.', url: '/#' + r.id });
      }
      if (r.mark != null && R.reading) {
        const lvl = R.reading.level;
        if (lvl >= r.mark && !notified[r.id]) {
          messages.push({ title: name + ' reached ' + (r.markName || 'your mark'), body: 'Water level ' + lvl.toFixed(2) + ' m, your mark is ' + r.mark.toFixed(2) + ' m.', url: '/#' + r.id });
          notified[r.id] = true;
        } else if (lvl < r.mark - 0.05 && notified[r.id]) {
          notified[r.id] = false; // re-arm once the water has dropped back
        }
      }
    }
    if (!messages.length) { if (JSON.stringify(notified) !== JSON.stringify(s.notified || {})) await stores.subs.setJSON(s.key, { subscription: s.subscription, rivers: s.rivers, created: s.created, notified }); continue; }
    try {
      for (const m of messages) { await send(s.subscription, JSON.stringify(m)); sent++; }
      await stores.subs.setJSON(s.key, { subscription: s.subscription, rivers: s.rivers, created: s.created, notified });
    } catch (e) {
      if (e && (e.statusCode === 404 || e.statusCode === 410)) { await stores.subs.delete(s.key); removed++; }
      else log('send failed: ' + (e && e.message));
    }
  }
  return { subscribers: subs.length, rivers: ids.length, sent, removed };
}
