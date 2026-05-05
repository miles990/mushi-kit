/**
 * myelin — Telemetry
 *
 * Logs every decision for analysis and crystallization.
 * Append-only JSONL format — human-readable, grep-friendly.
 */
import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
/** Append a decision to the log file */
export function logDecision(path, event, action, reason, method, latencyMs) {
    const entry = {
        _type: 'decision',
        ts: new Date().toISOString(),
        event,
        action,
        reason,
        method,
        latencyMs,
    };
    try {
        const dir = dirname(path);
        if (!existsSync(dir))
            mkdirSync(dir, { recursive: true });
        appendFileSync(path, JSON.stringify(entry) + '\n', 'utf-8');
    }
    catch {
        // fire-and-forget — telemetry should never break the main flow
    }
}
/** Read all decision logs from a JSONL file (filters out crystallization events) */
export function readDecisionLog(path) {
    if (!existsSync(path))
        return [];
    try {
        const lines = readFileSync(path, 'utf-8').trim().split('\n');
        return lines
            .filter(line => line.length > 0)
            .map(line => {
            try {
                return JSON.parse(line);
            }
            catch {
                return null;
            }
        })
            .filter((entry) => {
            if (!entry)
                return false;
            // Filter out crystallization events (which have string 'event' field)
            if (typeof entry.event === 'string')
                return false;
            // Also filter by _type discriminator if present
            if ('_type' in entry && entry._type !== 'decision')
                return false;
            // Must have method and action fields
            return typeof entry.method === 'string' && typeof entry.action === 'string';
        });
    }
    catch {
        return [];
    }
}
/** Get only LLM decisions (these are candidates for crystallization) */
export function getLlmDecisions(logs) {
    return logs.filter(log => log.method === 'llm');
}
/** Log a crystallization event (candidate found, rule promoted, rule removed) */
export function logCrystallization(path, event, details) {
    const entry = {
        _type: 'crystallization',
        ts: new Date().toISOString(),
        event,
        ...details,
    };
    try {
        const dir = dirname(path);
        if (!existsSync(dir))
            mkdirSync(dir, { recursive: true });
        appendFileSync(path, JSON.stringify(entry) + '\n', 'utf-8');
    }
    catch {
        // fire-and-forget
    }
}
//# sourceMappingURL=telemetry.js.map