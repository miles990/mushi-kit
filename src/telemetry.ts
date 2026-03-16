/**
 * myelinate — Telemetry
 *
 * Logs every decision for analysis and crystallization.
 * Append-only JSONL format — human-readable, grep-friendly.
 */

import { appendFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { DecisionLog, TriageEvent, Method } from './types.ts';

/** Append a decision to the log file */
export function logDecision(
  path: string,
  event: TriageEvent,
  action: string,
  reason: string,
  method: Method,
  latencyMs: number,
): void {
  const entry = {
    ts: new Date().toISOString(),
    event,
    action,
    reason,
    method,
    latencyMs,
  } satisfies DecisionLog<string>;

  try {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(path, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    // fire-and-forget — telemetry should never break the main flow
  }
}

/** Read all decision logs from a JSONL file */
export function readDecisionLog(path: string): DecisionLog<string>[] {
  if (!existsSync(path)) return [];
  try {
    const lines = readFileSync(path, 'utf-8').trim().split('\n');
    return lines
      .filter(line => line.length > 0)
      .map(line => JSON.parse(line) as DecisionLog);
  } catch {
    return [];
  }
}

/** Get only LLM decisions (these are candidates for crystallization) */
export function getLlmDecisions(logs: DecisionLog<string>[]): DecisionLog<string>[] {
  return logs.filter(log => log.method === 'llm');
}
