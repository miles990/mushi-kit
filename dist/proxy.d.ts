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
export declare function startProxy(config: ProxyConfig): void;
//# sourceMappingURL=proxy.d.ts.map