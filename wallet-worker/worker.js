// Billetterie 3D · Stade du Sénégal (concept) — signature des billets Google Wallet.
// Les clés restent ici, côté serveur (secrets Cloudflare), jamais dans le site public.
// Secrets attendus : GOOGLE_ISSUER_ID, GOOGLE_SA_EMAIL, GOOGLE_SA_PRIVATE_KEY
// Variable : ALLOWED_ORIGINS (ex. "https://fadiloundour.github.io")

const enc = new TextEncoder();
const b64url = (buf) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = ''; for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const b64urlJson = (o) => b64url(enc.encode(JSON.stringify(o)));

let keyCache = null;
async function importKey(pem) {
  if (keyCache) return keyCache;
  const body = pem.replace(/\\n/g, '\n').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  keyCache = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  return keyCache;
}
async function signJwt(payload, pem) {
  const head = b64urlJson({ alg: 'RS256', typ: 'JWT' });
  const data = head + '.' + b64urlJson(payload);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await importKey(pem), enc.encode(data));
  return data + '.' + b64url(sig);
}

const str = (v, max = 80) => (typeof v === 'string' || typeof v === 'number') ? String(v).slice(0, max) : '';
const idPart = (s) => str(s, 60).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9_-]/g, '_');
const loc = (value, lang) => ({ defaultValue: { language: lang, value } });

export function buildPayload(t, env, origin) {
  const lang = t.lang === 'en' ? 'en' : 'fr';
  const issuer = env.GOOGLE_ISSUER_ID;
  const code = str(t.code, 20);
  if (!/^SDS-[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(code)) throw new Error('code');
  const title = str(t.title, 70) || 'Événement';
  const f = (t.fields && typeof t.fields === 'object') ? t.fields : {};
  const classId = `${issuer}.sds_demo_${idPart(title).slice(0, 40)}`;
  const demo = lang === 'en' ? 'DEMO TICKET — NOT VALID' : 'BILLET DE DÉMONSTRATION — NON VALABLE';
  const seat = str(f['SIÈGE'] ?? f['PLACE'] ?? f['SIÈGES'], 20);
  const seatInfo = {};
  if (seat) seatInfo.seat = loc(seat, lang);
  if (f.RANG != null) seatInfo.row = loc(str(f.RANG, 10), lang);
  if (f.BLOC != null) seatInfo.section = loc(str(f.BLOC, 10), lang);
  if (f.PORTE != null) seatInfo.gate = loc(str(f.PORTE, 10), lang);
  const modules = [{ id: 'demo', header: lang === 'en' ? 'Notice' : 'Avertissement', body: demo }];
  if (t.date) modules.push({ id: 'date', header: lang === 'en' ? 'Date' : 'Date', body: str(t.date, 60) });
  if (t.slot) modules.push({ id: 'slot', header: lang === 'en' ? 'Arrival' : 'Arrivée', body: str(t.slot, 80) });
  if (t.label) modules.push({ id: 'label', header: lang === 'en' ? 'Seat' : 'Place', body: str(t.label, 80) + (t.sub ? ' · ' + str(t.sub, 90) : '') });
  const color = '#0d4a2a';
  return {
    iss: env.GOOGLE_SA_EMAIL, aud: 'google', typ: 'savetowallet', iat: Math.floor(Date.now() / 1000),
    origins: [origin],
    payload: {
      eventTicketClasses: [{
        id: classId,
        issuerName: 'Billetterie 3D · concept non officiel',
        reviewStatus: 'UNDER_REVIEW',
        eventName: loc(title, lang),
        venue: { name: loc('Stade Abdoulaye Wade', lang), address: loc('Diamniadio, Sénégal', lang) },
        hexBackgroundColor: color,
      }],
      eventTicketObjects: [{
        id: `${issuer}.${code}`,
        classId, state: 'ACTIVE', hexBackgroundColor: color,
        seatInfo,
        ticketNumber: code,
        barcode: { type: 'QR_CODE', value: code, alternateText: code },
        textModulesData: modules,
      }],
    },
  };
}

function cors(origin, allowed) {
  return {
    'Access-Control-Allow-Origin': allowed ? origin : 'null',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Vary': 'Origin',
  };
}

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean).includes(origin);
    const h = cors(origin, allowed);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: h });
    const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { ...h, 'Content-Type': 'application/json' } });
    if (!allowed) return json({ error: 'origin' }, 403);
    if (req.method !== 'POST' || new URL(req.url).pathname !== '/google') return json({ error: 'not_found' }, 404);
    if (!env.GOOGLE_ISSUER_ID || !env.GOOGLE_SA_EMAIL || !env.GOOGLE_SA_PRIVATE_KEY) return json({ error: 'not_configured' }, 503);
    let t; try { t = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
    try {
      const jwt = await signJwt(buildPayload(t, env, origin), env.GOOGLE_SA_PRIVATE_KEY);
      return json({ saveUrl: 'https://pay.google.com/gp/v/save/' + jwt });
    } catch (e) { return json({ error: 'bad_ticket' }, 400); }
  },
};
