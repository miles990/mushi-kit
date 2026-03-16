/**
 * myelin — API Proxy
 *
 * Transparent HTTP proxy between your app and the LLM API.
 * Logs all requests. Caches deterministic responses after consistent hits.
 *
 * Usage:
 *   myelin proxy --port 8100 --target https://api.anthropic.com
 *   export ANTHROPIC_BASE_URL=http://localhost:8100
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export interface ProxyConfig {
  port: number;
  target: string;
  apiKey?: string;
  shadow?: boolean;
  cachePath?: string;
  logPath?: string;
  /** Full payload log — request body + response body (default: ./myelin-payload.jsonl) */
  payloadLogPath?: string;
  /** How many consistent identical responses before serving from cache */
  minHits?: number;
}

interface CacheEntry {
  hash: string;
  response: string;
  contentType: string;
  statusCode: number;
  hitCount: number;
  firstSeen: string;
  lastSeen: string;
}

interface RequestLog {
  ts: string;
  method: string;
  path: string;
  hash: string;
  source: 'cache' | 'forwarded' | 'shadow';
  latencyMs: number;
  status: number;
  model?: string;
}

interface PayloadLog {
  ts: string;
  hash: string;
  source: 'cache' | 'forwarded' | 'shadow';
  latencyMs: number;
  request: {
    method: string;
    path: string;
    model?: string;
    body: unknown;
  };
  response: {
    status: number;
    body: unknown;
    streaming?: boolean;
    truncated?: boolean;
  };
  crystallization?: {
    event: 'cache_hit' | 'cache_new' | 'cache_promoted' | 'cache_reset';
    hitCount: number;
    minHits: number;
  };
}

/** Safely parse JSON, return raw string if not JSON */
function safeParse(text: string): unknown {
  try { return JSON.parse(text); } catch { return text; }
}

/** Max payload body size to log (2MB) — truncate beyond this */
const MAX_PAYLOAD_SIZE = 2 * 1024 * 1024;

function logPayload(path: string, entry: PayloadLog): void {
  try {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(path, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    // fire-and-forget — payload logging should never break the proxy
  }
}

/** Hash a request body for exact matching. Normalizes by stripping volatile fields. */
function hashRequest(body: string): string {
  try {
    const parsed = JSON.parse(body);
    // Keep semantically meaningful fields, drop volatile ones
    const normalized = {
      model: parsed.model,
      messages: parsed.messages,
      system: parsed.system,
      max_tokens: parsed.max_tokens,
      temperature: parsed.temperature,
      tools: parsed.tools,
      tool_choice: parsed.tool_choice,
    };
    return createHash('sha256').update(JSON.stringify(normalized)).digest('hex').slice(0, 16);
  } catch {
    return createHash('sha256').update(body).digest('hex').slice(0, 16);
  }
}

function loadCache(path: string): Map<string, CacheEntry> {
  if (!existsSync(path)) return new Map();
  try {
    const data = JSON.parse(readFileSync(path, 'utf-8'));
    return new Map(Object.entries(data));
  } catch {
    return new Map();
  }
}

function saveCache(path: string, cache: Map<string, CacheEntry>): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  writeFileSync(path, JSON.stringify(Object.fromEntries(cache), null, 2), 'utf-8');
}

function logRequest(path: string, entry: RequestLog): void {
  const dir = dirname(path);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  appendFileSync(path, JSON.stringify(entry) + '\n', 'utf-8');
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

async function forwardRequest(
  target: string,
  method: string,
  path: string,
  headers: Record<string, string>,
  body: string,
): Promise<{ status: number; headers: Record<string, string>; body: string }> {
  const url = `${target}${path}`;

  const response = await fetch(url, { method, headers, body });
  const responseBody = await response.text();
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((val, key) => { responseHeaders[key] = val; });

  return { status: response.status, headers: responseHeaders, body: responseBody };
}

/** Forward a streaming request, piping SSE chunks directly to the client. */
async function forwardStreaming(
  target: string,
  method: string,
  path: string,
  headers: Record<string, string>,
  body: string,
  res: ServerResponse,
  logPath: string,
  payloadLogPath: string | null,
  hash: string,
): Promise<void> {
  const url = `${target}${path}`;
  const start = Date.now();

  const response = await fetch(url, { method, headers, body });

  // Forward status and headers
  const fwdHeaders: Record<string, string> = {};
  response.headers.forEach((val, key) => {
    if (!['transfer-encoding', 'connection', 'keep-alive'].includes(key.toLowerCase())) {
      fwdHeaders[key] = val;
    }
  });
  res.writeHead(response.status, fwdHeaders);

  // Pipe the body through, accumulating for payload log
  const responseChunks: Buffer[] = [];
  let totalSize = 0;
  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
        if (totalSize < MAX_PAYLOAD_SIZE) {
          responseChunks.push(Buffer.from(value));
          totalSize += value.length;
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
  res.end();

  let model: string | undefined;
  try { model = JSON.parse(body).model; } catch {}
  const latencyMs = Date.now() - start;

  logRequest(logPath, {
    ts: new Date().toISOString(),
    method, path, hash,
    source: 'forwarded',
    latencyMs,
    status: response.status,
    model,
  });

  // Full payload log (streaming)
  if (payloadLogPath) {
    const responseBody = Buffer.concat(responseChunks).toString();
    const truncated = totalSize >= MAX_PAYLOAD_SIZE;
    logPayload(payloadLogPath, {
      ts: new Date().toISOString(),
      hash,
      source: 'forwarded',
      latencyMs,
      request: { method, path, model, body: safeParse(body) },
      response: { status: response.status, body: safeParse(responseBody), streaming: true, truncated },
    });
  }
}

export function startProxy(config: ProxyConfig): void {
  const {
    port,
    target,
    apiKey,
    shadow = true,
    cachePath = './myelin-cache.json',
    logPath = './myelin-proxy.jsonl',
    payloadLogPath = './myelin-payload.jsonl',
    minHits = 3,
  } = config;

  const cache = loadCache(cachePath);
  const stats = { total: 0, cached: 0, forwarded: 0, started: new Date().toISOString() };

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const start = Date.now();

    // --- Internal endpoints ---
    if (req.url === '/__myelin/health') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', ...stats, cacheSize: cache.size, shadow }));
      return;
    }

    if (req.url === '/__myelin/stats') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({
        ...stats,
        cacheSize: cache.size,
        shadow,
        uptime: Date.now() - new Date(stats.started).getTime(),
        hitRate: stats.total > 0 ? ((stats.cached / stats.total) * 100).toFixed(1) + '%' : '0%',
      }));
      return;
    }

    if (req.url === '/__myelin/cache') {
      const entries = [...cache.values()].map(e => ({
        hash: e.hash,
        hitCount: e.hitCount,
        firstSeen: e.firstSeen,
        lastSeen: e.lastSeen,
        statusCode: e.statusCode,
        responseLength: e.response.length,
      }));
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(entries, null, 2));
      return;
    }

    // --- Build forwarding headers ---
    const fwdHeaders: Record<string, string> = {
      'content-type': req.headers['content-type'] ?? 'application/json',
    };
    for (const key of ['x-api-key', 'anthropic-version', 'anthropic-beta', 'authorization']) {
      const val = req.headers[key];
      if (val) fwdHeaders[key] = Array.isArray(val) ? val[0] : val;
    }
    if (apiKey && !fwdHeaders['x-api-key'] && !fwdHeaders['authorization']) {
      fwdHeaders['x-api-key'] = apiKey;
    }

    // --- Non-POST: forward directly ---
    if (req.method !== 'POST') {
      try {
        const body = await readBody(req);
        const response = await forwardRequest(target, req.method ?? 'GET', req.url ?? '/', fwdHeaders, body);
        res.writeHead(response.status, response.headers);
        res.end(response.body);
      } catch (err) {
        res.writeHead(502, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'proxy_error', message: String(err) }));
      }
      return;
    }

    // --- POST: the interesting path ---
    const body = await readBody(req);
    const hash = hashRequest(body);
    stats.total++;

    // Detect streaming
    let isStreaming = false;
    try { isStreaming = JSON.parse(body).stream === true; } catch {}

    // Streaming requests: forward directly (no caching for MVP)
    if (isStreaming) {
      stats.forwarded++;
      try {
        await forwardStreaming(target, 'POST', req.url ?? '/', fwdHeaders, body, res, logPath, payloadLogPath, hash);
      } catch (err) {
        if (!res.headersSent) {
          res.writeHead(502, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ error: 'proxy_error', message: String(err) }));
        }
      }
      return;
    }

    // Non-streaming: check cache
    const cached = cache.get(hash);
    if (cached && !shadow && cached.hitCount >= minHits) {
      cached.hitCount++;
      cached.lastSeen = new Date().toISOString();
      stats.cached++;
      const latencyMs = Date.now() - start;

      logRequest(logPath, {
        ts: new Date().toISOString(),
        method: 'POST', path: req.url ?? '/', hash,
        source: 'cache',
        latencyMs,
        status: cached.statusCode,
      });

      // Full payload log (cache hit — crystallized response)
      if (payloadLogPath) {
        let model: string | undefined;
        try { model = JSON.parse(body).model; } catch {}
        logPayload(payloadLogPath, {
          ts: new Date().toISOString(),
          hash,
          source: 'cache',
          latencyMs,
          request: { method: 'POST', path: req.url ?? '/', model, body: safeParse(body) },
          response: { status: cached.statusCode, body: safeParse(cached.response) },
          crystallization: { event: 'cache_hit', hitCount: cached.hitCount, minHits },
        });
      }

      if (stats.cached % 10 === 0) saveCache(cachePath, cache);

      res.writeHead(cached.statusCode, { 'content-type': cached.contentType });
      res.end(cached.response);
      return;
    }

    // Forward to target LLM API
    try {
      const response = await forwardRequest(target, 'POST', req.url ?? '/', fwdHeaders, body);
      const latencyMs = Date.now() - start;
      stats.forwarded++;

      // Track for crystallization (capture event BEFORE mutation)
      let crystEvent: PayloadLog['crystallization'] | undefined;
      if (response.status === 200) {
        if (cached) {
          const sameResponse = cached.response === response.body;
          if (sameResponse) {
            cached.hitCount++;
            crystEvent = {
              event: cached.hitCount >= minHits ? 'cache_promoted' : 'cache_hit',
              hitCount: cached.hitCount,
              minHits,
            };
          } else {
            cached.response = response.body;
            cached.hitCount = 1;
            crystEvent = { event: 'cache_reset', hitCount: 1, minHits };
          }
          cached.lastSeen = new Date().toISOString();
        } else {
          cache.set(hash, {
            hash,
            response: response.body,
            contentType: response.headers['content-type'] ?? 'application/json',
            statusCode: response.status,
            hitCount: 1,
            firstSeen: new Date().toISOString(),
            lastSeen: new Date().toISOString(),
          });
          crystEvent = { event: 'cache_new', hitCount: 1, minHits };
        }
        if (stats.forwarded % 10 === 0) saveCache(cachePath, cache);
      }

      let model: string | undefined;
      try { model = JSON.parse(body).model; } catch {}
      const source = shadow ? 'shadow' as const : 'forwarded' as const;

      logRequest(logPath, {
        ts: new Date().toISOString(),
        method: 'POST', path: req.url ?? '/', hash,
        source,
        latencyMs,
        status: response.status,
        model,
      });

      // Full payload log (forwarded POST)
      if (payloadLogPath) {
        const truncated = response.body.length > MAX_PAYLOAD_SIZE;
        logPayload(payloadLogPath, {
          ts: new Date().toISOString(),
          hash,
          source,
          latencyMs,
          request: { method: 'POST', path: req.url ?? '/', model, body: safeParse(body) },
          response: {
            status: response.status,
            body: safeParse(truncated ? response.body.slice(0, MAX_PAYLOAD_SIZE) : response.body),
            truncated,
          },
          crystallization: crystEvent,
        });
      }

      // Forward response
      const respHeaders: Record<string, string> = {};
      for (const [key, val] of Object.entries(response.headers)) {
        if (!['transfer-encoding', 'connection', 'keep-alive'].includes(key.toLowerCase())) {
          respHeaders[key] = val;
        }
      }
      res.writeHead(response.status, respHeaders);
      res.end(response.body);
    } catch (err) {
      stats.forwarded++;
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'proxy_error', message: String(err) }));

      const errLatencyMs = Date.now() - start;
      logRequest(logPath, {
        ts: new Date().toISOString(),
        method: 'POST', path: req.url ?? '/', hash,
        source: 'forwarded',
        latencyMs: errLatencyMs,
        status: 502,
      });

      // Full payload log (error)
      if (payloadLogPath) {
        let model: string | undefined;
        try { model = JSON.parse(body).model; } catch {}
        logPayload(payloadLogPath, {
          ts: new Date().toISOString(),
          hash,
          source: 'forwarded',
          latencyMs: errLatencyMs,
          request: { method: 'POST', path: req.url ?? '/', model, body: safeParse(body) },
          response: { status: 502, body: { error: 'proxy_error', message: String(err) } },
        });
      }
    }
  });

  server.listen(port, () => {
    console.log(`
myelin proxy
============
Listening:  http://localhost:${port}
Target:     ${target}
Mode:       ${shadow ? 'shadow (log only, no interception)' : 'active (caching enabled)'}
Cache:      ${cachePath} (${cache.size} entries)
Log:        ${logPath}
Payload:    ${payloadLogPath} (full request/response bodies)
Min hits:   ${minHits} (consistent responses before serving from cache)

Usage:
  export ANTHROPIC_BASE_URL=http://localhost:${port}
  # All Anthropic SDK requests now flow through myelin

Endpoints:
  /__myelin/health    Health check + basic stats
  /__myelin/stats     Detailed usage statistics
  /__myelin/cache     View cached entries
`.trim());
  });

  process.on('SIGINT', () => {
    console.log('\nSaving cache...');
    saveCache(cachePath, cache);
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    saveCache(cachePath, cache);
    process.exit(0);
  });
}
