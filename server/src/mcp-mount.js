'use strict';

/**
 * Mounts the MCP server onto the existing Express app.
 *
 * Two transports are exposed, on purpose:
 *
 *   POST/GET/DELETE /mcp   Streamable HTTP — the current standard.
 *                          Modern clients (2026-07-28 protocol) use this.
 *
 *   GET  /sse              SSE — the 2025-era transport.
 *   POST /messages         Paired message endpoint for the SSE transport.
 *
 * SSE is officially deprecated (it now lives in @modelcontextprotocol/
 * server-legacy and is slated for removal in v3), but plenty of agents in the
 * wild still speak it, so it is served from the legacy package rather than
 * left to rot. New integrations should use /mcp.
 *
 * Both endpoints share one server factory, so the tools are identical.
 */

const { createMcpHandler } = require('@modelcontextprotocol/server');
const { toNodeHandler } = require('@modelcontextprotocol/node');
const { buildServer } = require('./mcp');

let sseCache = null;

/**
 * Shared-secret gate for every MCP route.
 *
 * The MCP surface includes a free-form SQL tool, so it must never be open:
 * anyone who learns the URL could read the whole database.
 *
 * The token is accepted three ways so any client can authenticate with what
 * it already supports:
 *
 *   Authorization: Bearer <token>     preferred — standard, never logged in URLs
 *   X-MCP-Token: <token>              simple header for scripts
 *   ?token=<token>                    last resort for clients that cannot set headers
 *
 * Set MCP_TOKEN to enable. If it is unset the routes stay closed (fail
 * closed) rather than silently exposing the database.
 */
function requireMcpToken(req, res, next) {
  const expected = process.env.MCP_TOKEN || '';

  if (!expected) {
    return res.status(503).json({
      error: 'MCP disabled: no MCP_TOKEN configured on the server',
    });
  }

  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const header = (req.headers['x-mcp-token'] || '').trim();
  const query = (req.query.token || '').trim();

  // Constant-time compare to avoid leaking the token through timing.
  const given = bearer || header || query;
  const ok = given.length === expected.length
    && require('node:crypto').timingSafeEqual(Buffer.from(given), Buffer.from(expected));

  if (!ok) {
    res.set('WWW-Authenticate', 'Bearer realm="Shengyin MCP"');
    return res.status(401).json({ error: 'unauthorized: missing or invalid MCP token' });
  }
  return next();
}

/**
 * Mounts the modern Streamable HTTP endpoint.
 * `legacy: 'stateless'` keeps 2025-era requests working on the same route.
 */
function mountStreamableHttp(app, { path = '/mcp' } = {}) {
  const handler = createMcpHandler(buildServer, {
    legacy: 'stateless',
    keepAliveMs: 15000,
    maxRequestBodySize: 1024 * 1024,
  });
  const node = toNodeHandler(handler);

  // GET opens the notification stream, POST sends messages, DELETE ends the
  // session. All three are handled by the same adapter.
  app.all(path, requireMcpToken, (req, res) => {
    Promise.resolve(node(req, res)).catch((err) => {
      console.error('[mcp] streamable-http error:', err.message);
      if (!res.headersSent) res.status(500).end('mcp error');
    });
  });

  return path;
}

/**
 * Mounts the legacy SSE pair. Requires the legacy package; if it is not
 * installed the route is skipped rather than crashing the app.
 */
function mountSse(app, { ssePath = '/sse', messagesPath = '/messages' } = {}) {
  let SSEServerTransport;
  try {
    ({ SSEServerTransport } = require('@modelcontextprotocol/server-legacy/sse'));
  } catch (err) {
    console.warn('[mcp] SSE transport unavailable (legacy package not installed)');
    return null;
  }

  // One live SSE session per connection, keyed by the transport's sessionId.
  const sessions = new Map();
  if (!sseCache) sseCache = sessions;

  app.get(ssePath, requireMcpToken, async (req, res) => {
    try {
      const transport = new SSEServerTransport(messagesPath, res);
      sessions.set(transport.sessionId, transport);

      res.on('close', () => sessions.delete(transport.sessionId));

      const server = buildServer();
      await server.connect(transport);
    } catch (err) {
      console.error('[mcp] sse connect error:', err.message);
      if (!res.headersSent) res.status(500).end('sse error');
    }
  });

  app.post(messagesPath, requireMcpToken, async (req, res) => {
    const sessionId = req.query.sessionId;
    const transport = sessions.get(sessionId);

    if (!transport) {
      return res.status(404).json({ error: 'unknown or expired sessionId' });
    }
    try {
      await transport.handlePostMessage(req, res, req.body);
    } catch (err) {
      console.error('[mcp] sse message error:', err.message);
      if (!res.headersSent) res.status(500).end('sse message error');
    }
  });

  return { ssePath, messagesPath };
}

/**
 * Wires every transport and returns a small description of what is live,
 * so the boot log and a status endpoint can report it honestly.
 */
function mountMcp(app) {
  const http = mountStreamableHttp(app);
  const sse = mountSse(app);
  return { streamable_http: http, sse };
}

module.exports = { mountMcp };
