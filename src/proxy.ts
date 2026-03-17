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
import { readFileSync, writeFileSync, appendFileSync, existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { basename, dirname } from 'node:path';

export interface ProxyConfig {
  port: number;
  target: string;
  apiKey?: string;
  shadow?: boolean;
  cachePath?: string;
  logPath?: string;
  /** Payload metadata log base path (daily rotated as *-YYYY-MM-DD.jsonl) */
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
  route: string;
  method: string;
  status: number;
  requestBytes: number;
  responseBytes?: number;
  latencyMs: number;
  model?: string;
  tokenCount?: {
    input?: number;
    output?: number;
    total?: number;
  };
  streaming?: boolean;
  crystallization?: {
    event: 'cache_hit' | 'cache_new' | 'cache_promoted' | 'cache_reset';
    hitCount: number;
    minHits: number;
  };
}

const PAYLOAD_RETENTION_DAYS = 7;
const PAYLOAD_CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_METADATA_CAPTURE_SIZE = 512 * 1024;
let lastPayloadCleanupAt = 0;

function getDayStamp(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildDailyPayloadPath(basePath: string, date: Date): string {
  const dir = dirname(basePath);
  const file = basename(basePath);
  const stem = file.endsWith('.jsonl') ? file.slice(0, -'.jsonl'.length) : file;
  return `${dir}/${stem}-${getDayStamp(date)}.jsonl`;
}

function parseTokenUsage(payload: unknown): PayloadLog['tokenCount'] | undefined {
  if (!payload || typeof payload !== 'object') return undefined;
  const usage = (payload as { usage?: unknown }).usage;
  if (!usage || typeof usage !== 'object') return undefined;

  const raw = usage as Record<string, unknown>;
  const input = typeof raw.input_tokens === 'number'
    ? raw.input_tokens
    : typeof raw.prompt_tokens === 'number'
      ? raw.prompt_tokens
      : undefined;
  const output = typeof raw.output_tokens === 'number'
    ? raw.output_tokens
    : typeof raw.completion_tokens === 'number'
      ? raw.completion_tokens
      : undefined;
  const total = typeof raw.total_tokens === 'number'
    ? raw.total_tokens
    : input !== undefined || output !== undefined
      ? (input ?? 0) + (output ?? 0)
      : undefined;

  if (input === undefined && output === undefined && total === undefined) return undefined;
  return { input, output, total };
}

function parseJson(text: string): unknown {
  try { return JSON.parse(text); } catch { return undefined; }
}

function parseSseTokenUsageFromBody(text: string): PayloadLog['tokenCount'] | undefined {
  const lines = text.split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i].trim();
    if (!line.startsWith('data:')) continue;
    const data = line.slice(5).trim();
    if (!data || data === '[DONE]') continue;
    const parsed = parseJson(data);
    const usage = parseTokenUsage(parsed);
    if (usage) return usage;
  }
  return undefined;
}

function cleanupOldPayloadLogs(basePath: string, now: Date): void {
  const dir = dirname(basePath);
  if (!existsSync(dir)) return;

  const file = basename(basePath);
  const stem = file.endsWith('.jsonl') ? file.slice(0, -'.jsonl'.length) : file;
  const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedStem}-(\\d{4}-\\d{2}-\\d{2})\\.jsonl$`);
  const cutoff = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - PAYLOAD_RETENTION_DAYS,
  ));

  for (const item of readdirSync(dir, { withFileTypes: true })) {
    if (!item.isFile()) continue;
    const match = item.name.match(pattern);
    if (!match) continue;
    const fileDate = new Date(`${match[1]}T00:00:00.000Z`);
    if (Number.isNaN(fileDate.getTime())) continue;
    if (fileDate < cutoff) {
      try {
        unlinkSync(`${dir}/${item.name}`);
      } catch {
        // fire-and-forget cleanup
      }
    }
  }
}

function logPayload(basePath: string, entry: PayloadLog): void {
  try {
    const now = new Date();
    const path = buildDailyPayloadPath(basePath, now);
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    if (Date.now() - lastPayloadCleanupAt > PAYLOAD_CLEANUP_INTERVAL_MS) {
      cleanupOldPayloadLogs(basePath, now);
      lastPayloadCleanupAt = Date.now();
    }
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
  response.headers.forEach((val, key) => {
    // fetch() auto-decompresses, so strip encoding headers to avoid client decompression errors
    if (!['content-encoding', 'content-length'].includes(key.toLowerCase())) {
      responseHeaders[key] = val;
    }
  });

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
    if (!['transfer-encoding', 'connection', 'keep-alive', 'content-encoding', 'content-length'].includes(key.toLowerCase())) {
      fwdHeaders[key] = val;
    }
  });
  res.writeHead(response.status, fwdHeaders);

  // Pipe the body through while keeping a bounded buffer for token metadata extraction.
  const responseChunks: Buffer[] = [];
  let responseBytes = 0;
  if (response.body) {
    const reader = response.body.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(value);
        responseBytes += value.length;
        if (responseBytes <= MAX_METADATA_CAPTURE_SIZE) {
          responseChunks.push(Buffer.from(value));
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

  // Payload metadata log (streaming)
  if (payloadLogPath) {
    const responseBody = Buffer.concat(responseChunks).toString();
    const tokenCount = parseSseTokenUsageFromBody(responseBody);
    logPayload(payloadLogPath, {
      ts: new Date().toISOString(),
      hash,
      source: 'forwarded',
      route: path,
      method,
      status: response.status,
      requestBytes: Buffer.byteLength(body),
      responseBytes,
      latencyMs,
      model,
      tokenCount,
      streaming: true,
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
    payloadLogPath = './payload.jsonl',
    minHits = 3,
  } = config;

  if (payloadLogPath) {
    cleanupOldPayloadLogs(payloadLogPath, new Date());
  }

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

      // Payload metadata log (cache hit — crystallized response)
      if (payloadLogPath) {
        let model: string | undefined;
        try { model = JSON.parse(body).model; } catch {}
        const tokenCount = parseTokenUsage(parseJson(cached.response));
        logPayload(payloadLogPath, {
          ts: new Date().toISOString(),
          hash,
          source: 'cache',
          route: req.url ?? '/',
          method: 'POST',
          status: cached.statusCode,
          requestBytes: Buffer.byteLength(body),
          responseBytes: Buffer.byteLength(cached.response),
          latencyMs,
          model,
          tokenCount,
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

      // Payload metadata log (forwarded POST)
      if (payloadLogPath) {
        const tokenCount = parseTokenUsage(parseJson(response.body));
        logPayload(payloadLogPath, {
          ts: new Date().toISOString(),
          hash,
          source,
          route: req.url ?? '/',
          method: 'POST',
          status: response.status,
          requestBytes: Buffer.byteLength(body),
          responseBytes: Buffer.byteLength(response.body),
          latencyMs,
          model,
          tokenCount,
          crystallization: crystEvent,
        });
      }

      // Forward response
      const respHeaders: Record<string, string> = {};
      for (const [key, val] of Object.entries(response.headers)) {
        if (!['transfer-encoding', 'connection', 'keep-alive', 'content-encoding', 'content-length'].includes(key.toLowerCase())) {
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

      // Payload metadata log (error)
      if (payloadLogPath) {
        let model: string | undefined;
        try { model = JSON.parse(body).model; } catch {}
        logPayload(payloadLogPath, {
          ts: new Date().toISOString(),
          hash,
          source: 'forwarded',
          route: req.url ?? '/',
          method: 'POST',
          status: 502,
          requestBytes: Buffer.byteLength(body),
          latencyMs: errLatencyMs,
          model,
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
Payload:    ${payloadLogPath} (daily rotated metadata log, 7-day retention)
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
