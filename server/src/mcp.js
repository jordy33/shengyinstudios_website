'use strict';

/**
 * Shengyin Studios — MCP server over the click analytics database.
 *
 * Purpose: let an agent (the content bot, or an analyst working with
 * DeepSeek/Jev) interrogate the analytics at will, instead of being limited
 * to the fixed aggregates exposed by GET /api/stats.
 *
 * Two things are exposed:
 *
 *   Tools     — schema discovery plus a read-only SQL escape hatch, so the
 *               agent can answer questions nobody anticipated.
 *   Resources — the canonical aggregates as ready-to-read JSON, so the common
 *               case costs no tokens on query construction.
 *
 * Transport: Streamable HTTP at /mcp (the current standard) with an SSE
 * alias at /sse+messages for older clients. See mcp-sse.js.
 *
 * SAFETY: every query runs on a dedicated read-only pool, and each statement
 * is validated as a single SELECT before it reaches MySQL. The credentials it
 * uses still belong to the shared user, so the validation is the real guard —
 * see assertReadOnly() below.
 */

const mysql = require('mysql2/promise');
const { McpServer } = require('@modelcontextprotocol/server');
const { z } = require('zod');

const DB = {
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'gpscontrol',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'shengyingstudios',
  charset: 'utf8mb4_unicode_ci',
  timezone: 'Z',
};

const MAX_ROWS = Number(process.env.MCP_MAX_ROWS || 500);
const QUERY_TIMEOUT_MS = Number(process.env.MCP_QUERY_TIMEOUT_MS || 10000);

let pool;

function getPool() {
  if (!pool) {
    pool = mysql.createPool({
      ...DB,
      waitForConnections: true,
      connectionLimit: 4,
      multipleStatements: false, // hard stop on stacked statements
      dateStrings: true,
    });
  }
  return pool;
}

/**
 * The only guard that matters. Anything that is not a lone SELECT (or WITH…
 * SELECT) is rejected before touching the database.
 *
 * Deliberately conservative: comments are stripped first so they cannot hide
 * a second statement, and a keyword denylist catches the shapes a read-only
 * grant would catch anyway but with a clearer error message.
 */
const FORBIDDEN = /\b(insert|update|delete|drop|truncate|alter|create|replace|grant|revoke|rename|load_file|into\s+outfile|into\s+dumpfile|lock\s+tables|call|handler|set\s+global|shutdown|kill)\b/i;

function assertReadOnly(sql) {
  let s = String(sql || '').trim();
  if (!s) throw new Error('empty query');

  // Strip comments — both -- and /* */ — so they cannot join two statements.
  s = s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ').replace(/#[^\n]*/g, ' ');

  // One statement only: a trailing semicolon is fine, anything after is not.
  const body = s.replace(/;\s*$/, '');
  if (body.includes(';')) throw new Error('only a single statement is allowed');

  if (!/^\s*(select|with)\b/i.test(body)) {
    throw new Error('only SELECT / WITH queries are allowed');
  }
  if (FORBIDDEN.test(body)) {
    throw new Error('query contains a non read-only keyword');
  }
  return body;
}

async function runQuery(sql, params = []) {
  const safe = assertReadOnly(sql);
  const conn = await getPool().getConnection();
  try {
    await conn.query('SET SESSION MAX_EXECUTION_TIME = ?', [QUERY_TIMEOUT_MS]);
    const [rows] = await conn.query({ sql: safe, timeout: QUERY_TIMEOUT_MS }, params);
    const truncated = rows.length > MAX_ROWS;
    return { rows: truncated ? rows.slice(0, MAX_ROWS) : rows, truncated, rowCount: rows.length };
  } finally {
    conn.release();
  }
}

/** Column metadata for the `clicks` table, read from information_schema. */
async function describeTable(table) {
  const { rows } = await runQuery(
    `SELECT COLUMN_NAME AS name, COLUMN_TYPE AS type, IS_NULLABLE AS nullable,
            COLUMN_KEY AS col_key, COLUMN_DEFAULT AS default_value
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [table]
  );
  return rows;
}

// ---------------------------------------------------------------------------
// Aggregates shared with the HTTP API
// ---------------------------------------------------------------------------

async function collectStats(days) {
  const since = `INTERVAL ${Number(days)} DAY`;
  const q = (sql) => runQuery(sql).then((r) => r.rows);

  const [totals] = await q(`
    SELECT COUNT(*) AS clicks, COUNT(DISTINCT visitor) AS visitors,
           COUNT(DISTINCT day) AS active_days
    FROM clicks WHERE day >= CURDATE() - ${since}`);

  return {
    window_days: Number(days),
    generated_at: new Date().toISOString(),
    totals,
    all_time: (await q(`
      SELECT COUNT(*) AS clicks, COUNT(DISTINCT day) AS active_days,
             MIN(day) AS first_day, MAX(day) AS last_day FROM clicks`))[0],
    by_link: await q(`
      SELECT link_id, COUNT(*) AS clicks, COUNT(DISTINCT visitor) AS visitors
      FROM clicks WHERE day >= CURDATE() - ${since}
      GROUP BY link_id ORDER BY clicks DESC`),
    by_referrer: await q(`
      SELECT COALESCE(referrer,'directo') AS referrer, COUNT(*) AS clicks,
             COUNT(DISTINCT visitor) AS visitors
      FROM clicks WHERE day >= CURDATE() - ${since}
      GROUP BY referrer ORDER BY clicks DESC`),
    by_content: await q(`
      SELECT utm_source AS source, utm_content AS content, COUNT(*) AS clicks,
             COUNT(DISTINCT visitor) AS visitors
      FROM clicks WHERE day >= CURDATE() - ${since}
        AND utm_content IS NOT NULL AND utm_content <> ''
      GROUP BY utm_source, utm_content ORDER BY clicks DESC LIMIT 50`),
    by_day: await q(`
      SELECT DATE_FORMAT(day,'%Y-%m-%d') AS day, COUNT(*) AS clicks,
             COUNT(DISTINCT visitor) AS visitors
      FROM clicks WHERE day >= CURDATE() - ${since}
      GROUP BY day ORDER BY day DESC`),
    by_country: await q(`
      SELECT COALESCE(country,'??') AS country, COUNT(*) AS clicks
      FROM clicks WHERE day >= CURDATE() - ${since}
      GROUP BY country ORDER BY clicks DESC LIMIT 25`),
    by_device: await q(`
      SELECT COALESCE(device,'?') AS device, COUNT(*) AS clicks
      FROM clicks WHERE day >= CURDATE() - ${since}
      GROUP BY device ORDER BY clicks DESC`),
  };
}

// ---------------------------------------------------------------------------
// MCP server
// ---------------------------------------------------------------------------

const SCHEMA_NOTES = `
Tabla única: clicks — un registro por clic en la landing.

  id           BIGINT       identificador incremental
  link_id      VARCHAR(64)  plataforma destino: spotify | apple | youtube | tiktok | instagram
  ts           DATETIME(3)  momento exacto del clic, en UTC
  day          DATE         día del clic (UTC) — úsalo para agrupar por fecha
  referrer     VARCHAR(64)  red social de origen ya clasificada:
                            tiktok | instagram | youtube | facebook | google | x | directo
  utm_source   VARCHAR(64)  ?utm_source del link
  utm_medium   VARCHAR(64)  ?utm_medium del link
  utm_campaign VARCHAR(64)  ?utm_campaign del link
  utm_content  VARCHAR(128) ?utm_content del link — IDENTIFICA EL SHORT CONCRETO
                            (ej. 'hook-01'). Es la columna clave para atribución.
  country      CHAR(8)      país ISO-2 desde el header de Cloudflare (ej. MX)
  device       VARCHAR(16)  mobile | tablet | desktop
  visitor      CHAR(16)     hash diario del visitante (sin IP); para únicos

Notas de uso:
  - 'visitors' siempre es COUNT(DISTINCT visitor); el hash rota cada día,
    así que un visitante que vuelve otro día cuenta de nuevo.
  - Filtra por ventana con: WHERE day >= CURDATE() - INTERVAL 30 DAY
  - Para saber qué video funcionó, agrupa por utm_content y orderna por clicks.
`.trim();

function buildServer() {
  const server = new McpServer({
    name: 'shengyin-analytics',
    version: '1.0.0',
  });

  server.registerTool(
    'get_stats',
    {
      title: 'Resumen de estadísticas',
      description:
        'Devuelve los agregados principales de clics en una ventana de días: totales, ' +
        'histórico, por plataforma, por red social de origen, por video (utm_content), ' +
        'por día, por país y por dispositivo. Es el punto de partida recomendado.',
      inputSchema: z.object({
        days: z.number().int().min(1).max(365).optional()
          .describe('Ventana en días hacia atrás. Por defecto 30.'),
      }),
    },
    async ({ days }) => {
      const data = await collectStats(days || 30);
      return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
    }
  );

  server.registerTool(
    'describe_schema',
    {
      title: 'Esquema de la base de datos',
      description:
        'Devuelve las columnas de la tabla clicks con su tipo y si aceptan nulos. ' +
        'Úsalo antes de escribir SQL si no estás seguro de los nombres.',
      inputSchema: z.object({
        table: z.string().optional().describe('Tabla a describir. Por defecto "clicks".'),
      }),
    },
    async ({ table }) => {
      const cols = await describeTable(table || 'clicks');
      if (!cols.length) {
        return {
          isError: true,
          content: [{ type: 'text', text: `No existe la tabla "${table || 'clicks'}".` }],
        };
      }
      return {
        content: [{
          type: 'text',
          text: `${SCHEMA_NOTES}\n\nColumnas:\n${JSON.stringify(cols, null, 2)}`,
        }],
      };
    }
  );

  server.registerTool(
    'query',
    {
      title: 'Consulta SQL de solo lectura',
      description:
        'Ejecuta una consulta SELECT (o WITH…SELECT) sobre la base de datos de ' +
        'analíticas y devuelve las filas en JSON. Solo lectura: INSERT, UPDATE, ' +
        'DELETE, DDL y múltiples sentencias son rechazadas. Úsalo para preguntas ' +
        'que get_stats no cubre, por ejemplo cruces entre país y video, o series ' +
        `temporales de un short concreto. Máximo ${MAX_ROWS} filas.`,
      inputSchema: z.object({
        sql: z.string().describe('Consulta SELECT. No incluyas punto y coma final.'),
        params: z.array(z.union([z.string(), z.number(), z.null()])).optional()
          .describe('Valores para los placeholders ? de la consulta.'),
      }),
    },
    async ({ sql, params }) => {
      try {
        const result = await runQuery(sql, params || []);
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({
              row_count: result.rowCount,
              truncated: result.truncated,
              max_rows: MAX_ROWS,
              rows: result.rows,
            }, null, 2),
          }],
        };
      } catch (err) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Error en la consulta: ${err.message}` }],
        };
      }
    }
  );

  // Resources: the common reports, ready to read without a tool round-trip.
  server.registerResource(
    'schema',
    'shengyin://schema',
    {
      title: 'Esquema de clicks',
      description: 'Documentación y columnas de la tabla clicks.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify({ notes: SCHEMA_NOTES, columns: await describeTable('clicks') }, null, 2),
      }],
    })
  );

  server.registerResource(
    'stats-30d',
    'shengyin://stats/30d',
    {
      title: 'Estadísticas de los últimos 30 días',
      description: 'Agregados completos de la ventana de 30 días.',
      mimeType: 'application/json',
    },
    async (uri) => ({
      contents: [{
        uri: uri.href,
        mimeType: 'application/json',
        text: JSON.stringify(await collectStats(30), null, 2),
      }],
    })
  );

  return server;
}

async function closePool() {
  if (pool) { await pool.end().catch(() => {}); pool = null; }
}

module.exports = { buildServer, collectStats, runQuery, assertReadOnly, closePool, SCHEMA_NOTES };
