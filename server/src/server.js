'use strict';

/**
 * Shengyin Studios — link hub + click analytics.
 *
 * Three responsibilities, deliberately small:
 *   1. GET  /            landing page with the streaming buttons
 *   2. POST /api/click   records one click event (fire-and-forget from the page)
 *   3. GET  /stats       dashboard over the recorded events
 *
 * Storage is MySQL (database: shengyingstudios). The schema is created on
 * boot if missing, so a fresh environment needs nothing but credentials.
 */

const path = require('node:path');
const crypto = require('node:crypto');
const express = require('express');
const mysql = require('mysql2/promise');

const PORT = Number(process.env.PORT || 7008);
const ROOT = path.resolve(__dirname, '..');

const DB = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'gpscontrol',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'shengyingstudios',
  waitForConnections: true,
  connectionLimit: 10,
  charset: 'utf8mb4_unicode_ci',
  timezone: 'Z',
};

// Optional shared secret for the dashboard. Unset => dashboard is open.
const STATS_TOKEN = process.env.STATS_TOKEN || '';

let pool;

async function initDb() {
  pool = mysql.createPool(DB);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS clicks (
      id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
      link_id      VARCHAR(64)  NOT NULL,
      ts           DATETIME(3)  NOT NULL,
      day          DATE         NOT NULL,
      referrer     VARCHAR(64)      NULL,
      utm_source   VARCHAR(64)      NULL,
      utm_medium   VARCHAR(64)      NULL,
      utm_campaign VARCHAR(64)      NULL,
      utm_content  VARCHAR(128)     NULL,
      country      CHAR(8)          NULL,
      device       VARCHAR(16)      NULL,
      visitor      CHAR(16)         NULL,
      PRIMARY KEY (id),
      KEY idx_link (link_id),
      KEY idx_day (day),
      KEY idx_content (utm_content),
      KEY idx_source_day (utm_source, day)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

/**
 * The link catalogue. `id` is what the browser posts back, so it is the
 * stable contract between the page and the analytics — renaming a label is
 * safe, renaming an id splits the historical series.
 *
 * `ready: false` renders the button disabled: the destination does not exist
 * yet (Spotify/Apple go live when DistroKid publishes). Turning a link on is
 * a one-word edit here.
 */
const LINKS = [
  { id: 'spotify',  label: 'Spotify',      sub: 'Listen on Spotify',    url: '', ready: false, primary: true },
  { id: 'apple',    label: 'Apple Music',  sub: 'Listen on Apple Music', url: '', ready: false, primary: true },
  { id: 'youtube',  label: 'YouTube',      sub: 'Subscribe to the channel', url: 'https://www.youtube.com/@ShengyinStudios', ready: true },
  { id: 'tiktok',   label: 'TikTok',       sub: 'Follow us',            url: 'https://www.tiktok.com/@ShengyinStudios',  ready: true },
  { id: 'instagram',label: 'Instagram',    sub: 'Follow us',            url: 'https://www.instagram.com/ShengyinStudios', ready: true },
];

const LINKS_BY_ID = new Map(LINKS.map((l) => [l.id, l]));

/**
 * Aggregates a referrer host into a platform bucket, so the dashboard can
 * answer the only question that matters for Step 3: which network is
 * actually sending people.
 */
function classifyReferrer(ref) {
  if (!ref) return 'directo';
  let host = '';
  try {
    host = new URL(ref).hostname.toLowerCase();
  } catch {
    host = String(ref).toLowerCase();
  }
  if (host.includes('tiktok')) return 'tiktok';
  if (host.includes('instagram')) return 'instagram';
  if (host.includes('youtube') || host.includes('youtu.be')) return 'youtube';
  if (host.includes('facebook')) return 'facebook';
  if (host.includes('google')) return 'google';
  if (host.includes('twitter') || host.includes('x.com')) return 'x';
  return host || 'directo';
}

function classifyDevice(ua) {
  const s = (ua || '').toLowerCase();
  if (/ipad|tablet/.test(s)) return 'tablet';
  if (/mobile|iphone|android/.test(s)) return 'mobile';
  return 'desktop';
}

/**
 * Daily-rotating visitor hash. Not a cookie, not an IP store: the raw IP is
 * salted and hashed, then discarded. Good enough to count "unique visitors
 * per day" without keeping anything personally identifying.
 */
function visitorHash(req, day) {
  const ip = req.headers['cf-connecting-ip'] || req.ip || '';
  const salt = process.env.VISITOR_SALT || 'shengyin';
  return crypto.createHash('sha256').update(`${salt}|${ip}|${day}`).digest('hex').slice(0, 16);
}

const app = express();
app.set('trust proxy', true);

// ---------------------------------------------------------------------------
// MCP — must be mounted BEFORE express.json().
//
// The MCP HTTP handler reads the request stream itself; once a body parser
// has consumed it, the handler sees an empty body and answers with a JSON
// parse error. Registration order is therefore load-bearing here.
//
// Tokens are not enforced on these routes: the MCP surface is meant for the
// bot, reachable only over the private tunnel.
// ---------------------------------------------------------------------------

const { mountMcp } = require('./mcp-mount');

const mcpRoutes = mountMcp(app);

// Every other route speaks JSON; 4kb is plenty for a click payload.
app.use(express.json({ limit: '4kb' }));

// ---------------------------------------------------------------------------
// API
// ---------------------------------------------------------------------------

const insertClickSql = `
  INSERT INTO clicks (link_id, ts, day, referrer, utm_source, utm_medium,
                      utm_campaign, utm_content, country, device, visitor)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`;

app.post('/api/click', async (req, res) => {
  const body = req.body || {};
  const linkId = String(body.link || '').slice(0, 64);

  if (!LINKS_BY_ID.has(linkId)) {
    return res.status(400).json({ ok: false, error: 'unknown link' });
  }

  const now = new Date();
  const day = now.toISOString().slice(0, 10);
  const clip = (v, n) => (v == null ? null : String(v).slice(0, n));

  // MySQL DATETIME wants 'YYYY-MM-DD HH:MM:SS.mmm', not ISO-8601 with 'Z'.
  const sqlTs = now.toISOString().slice(0, 23).replace('T', ' ');

  try {
    await pool.execute(insertClickSql, [
      linkId,
      sqlTs,
      day,
      classifyReferrer(body.referrer || req.headers.referer),
      clip(body.utm_source, 64),
      clip(body.utm_medium, 64),
      clip(body.utm_campaign, 64),
      clip(body.utm_content, 128),
      clip(req.headers['cf-ipcountry'] || body.country, 8),
      classifyDevice(req.headers['user-agent']),
      visitorHash(req, day),
    ]);
  } catch (err) {
    console.error('[click] insert failed:', err.message);
    return res.status(500).json({ ok: false });
  }

  // 204: the page fires this with sendBeacon and never reads the response.
  res.status(204).end();
});

app.get('/api/links', (_req, res) => {
  res.json({ links: LINKS });
});

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

/**
 * Token check for the analytics surface. When no token is configured the
 * whole surface is open, which is fine when it is only reachable through a
 * private tunnel.
 *
 * Accepts the token from the query string (human, pasted URL), the
 * `X-Stats-Token` header (automation), or HTTP basic auth (curl/scripts).
 */
function requireToken(req, res, next) {
  if (!STATS_TOKEN) return next();

  const given = req.query.token
    || req.headers['x-stats-token']
    || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');

  if (given === STATS_TOKEN) return next();

  // Basic auth fallback: any username, token as the password.
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const pass = decoded.slice(decoded.indexOf(':') + 1);
    if (pass === STATS_TOKEN) return next();
  }

  res.set('WWW-Authenticate', 'Basic realm="Shengyin Stats"');
  return res.status(401).type('text/plain').send('401 — token requerido');
}

/**
 * Collects every aggregate the dashboard and the bot both need.
 * Returns a plain object; the caller decides how to serialise it.
 */
async function collectStats(days) {
  const since = `INTERVAL ${days} DAY`;

  const [[totals]] = await pool.query(`
    SELECT COUNT(*) AS clicks,
           COUNT(DISTINCT visitor) AS visitors,
           COUNT(DISTINCT day) AS active_days
    FROM clicks
    WHERE day >= CURDATE() - ${since}
  `);

  const [byLink] = await pool.query(`
    SELECT link_id, COUNT(*) AS clicks, COUNT(DISTINCT visitor) AS visitors
    FROM clicks
    WHERE day >= CURDATE() - ${since}
    GROUP BY link_id
    ORDER BY clicks DESC
  `);

  const [byReferrer] = await pool.query(`
    SELECT COALESCE(referrer, 'directo') AS referrer,
           COUNT(*) AS clicks,
           COUNT(DISTINCT visitor) AS visitors
    FROM clicks
    WHERE day >= CURDATE() - ${since}
    GROUP BY referrer
    ORDER BY clicks DESC
  `);

  const [byDay] = await pool.query(`
    SELECT DATE_FORMAT(day, '%Y-%m-%d') AS day,
           COUNT(*) AS clicks, COUNT(DISTINCT visitor) AS visitors
    FROM clicks
    WHERE day >= CURDATE() - ${since}
    GROUP BY day
    ORDER BY day DESC
  `);

  // The Step 3 question: which specific short drove clicks.
  const [byContent] = await pool.query(`
    SELECT utm_source AS source, utm_content AS content,
           COUNT(*) AS clicks, COUNT(DISTINCT visitor) AS visitors
    FROM clicks
    WHERE day >= CURDATE() - ${since}
      AND utm_content IS NOT NULL
      AND utm_content <> ''
    GROUP BY utm_source, utm_content
    ORDER BY clicks DESC
    LIMIT 50
  `);

  const [byCountry] = await pool.query(`
    SELECT COALESCE(country, '??') AS country, COUNT(*) AS clicks
    FROM clicks
    WHERE day >= CURDATE() - ${since}
    GROUP BY country
    ORDER BY clicks DESC
    LIMIT 25
  `);

  const [byDevice] = await pool.query(`
    SELECT COALESCE(device, '?') AS device, COUNT(*) AS clicks
    FROM clicks
    WHERE day >= CURDATE() - ${since}
    GROUP BY device
    ORDER BY clicks DESC
  `);

  // ts is stored as UTC; emit ISO-8601 so consumers localise it themselves.
  const [recent] = await pool.query(`
    SELECT link_id,
           DATE_FORMAT(ts, '%Y-%m-%dT%H:%i:%s.000Z') AS ts,
           referrer, utm_source, utm_medium, utm_campaign,
           utm_content, country, device
    FROM clicks
    ORDER BY id DESC
    LIMIT 50
  `);

  // All-time totals, so the bot can see cumulative growth, not just a window.
  const [[allTime]] = await pool.query(`
    SELECT COUNT(*) AS clicks, COUNT(DISTINCT day) AS active_days,
           MIN(day) AS first_day, MAX(day) AS last_day
    FROM clicks
  `);

  return {
    generated_at: new Date().toISOString(),
    window_days: days,
    totals: {
      clicks: Number(totals.clicks) || 0,
      visitors: Number(totals.visitors) || 0,
      active_days: Number(totals.active_days) || 0,
    },
    all_time: {
      clicks: Number(allTime.clicks) || 0,
      active_days: Number(allTime.active_days) || 0,
      first_day: allTime.first_day,
      last_day: allTime.last_day,
    },
    by_link: byLink.map((r) => ({ ...r, clicks: Number(r.clicks), visitors: Number(r.visitors) })),
    by_referrer: byReferrer.map((r) => ({ ...r, clicks: Number(r.clicks), visitors: Number(r.visitors) })),
    by_day: byDay.map((r) => ({ ...r, clicks: Number(r.clicks), visitors: Number(r.visitors) })),
    by_content: byContent.map((r) => ({ ...r, clicks: Number(r.clicks), visitors: Number(r.visitors) })),
    by_country: byCountry.map((r) => ({ ...r, clicks: Number(r.clicks) })),
    by_device: byDevice.map((r) => ({ ...r, clicks: Number(r.clicks) })),
    recent,
  };
}

// ---------------------------------------------------------------------------
// Analytics — two faces of the same data.
//
//   /stats       HTML dashboard, for a human opening the URL
//   /api/stats   JSON, for the content bot and the analysis pipeline
//
// Both read the same aggregates, so the dashboard can never disagree with
// what the bot sees.
// ---------------------------------------------------------------------------

app.get('/stats', requireToken, (_req, res) => {
  res.sendFile(path.join(ROOT, 'public', 'stats.html'));
});

app.get('/api/stats', requireToken, async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 30, 1), 365);
  try {
    res.json(await collectStats(days));
  } catch (err) {
    console.error('[stats] query failed:', err.message);
    res.status(500).json({ ok: false, error: 'query failed' });
  }
});

// Convenience alias kept so an old bookmark does not 404.
app.get('/stats/view', requireToken, (_req, res) => {
  res.redirect(301, '/stats');
});

// ---------------------------------------------------------------------------
// Landing — two domains, one process.
//
// Cloudflare's tunnel sends every host to this port, so the only thing that
// distinguishes the two front doors is the Host header:
//
//   link.shengyinstudios.site  → the bio link: just the buttons. Someone
//                                arriving from a short wants to listen now.
//   www.shengyinstudios.site   → the label's home: hero, about, contact.
//
// Both read the same /api/links, so they can never disagree about which
// platforms are live.
// ---------------------------------------------------------------------------

function hostOf(req) {
  return String(req.headers['x-forwarded-host'] || req.headers.host || '')
    .toLowerCase()
    .split(':')[0];
}

app.get('/', (req, res) => {
  const host = hostOf(req);

  // The bio link. Kept intentionally minimal.
  if (host.startsWith('link.')) {
    return res.sendFile(path.join(ROOT, 'public', 'index.html'));
  }

  // Everything else (www, the apex, direct IP, localhost) gets the full page.
  return res.sendFile(path.join(ROOT, 'public', 'home.html'));
});

app.get('/healthz', (_req, res) => res.json({
  ok: true,
  ts: new Date().toISOString(),
  mcp: mcpRoutes,
}));

app.use(express.static(path.join(ROOT, 'public'), { maxAge: '1h', index: false }));

app.use((_req, res) => res.status(404).type('text/plain').send('404'));

let server;

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    console.log(`[shengyin] ${sig} — shutting down`);
    const done = () => pool.end().catch(() => {}).finally(() => process.exit(0));
    if (server) server.close(done); else done();
  });
}

initDb()
  .then(() => {
    server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`[shengyin] listening on :${PORT}  db=${DB.user}@${DB.host}/${DB.database}`);
      console.log(`[shengyin] stats token: ${STATS_TOKEN ? 'enabled' : 'DISABLED (open)'}`);
      console.log(`[shengyin] mcp: ${JSON.stringify(mcpRoutes)}`);
    });
  })
  .catch((err) => {
    console.error('[shengyin] database init failed:', err.message);
    process.exit(1);
  });

module.exports = app;
