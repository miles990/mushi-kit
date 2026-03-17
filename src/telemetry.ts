/**
 * myelin — Telemetry
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
  const entry: Record<string, unknown> = {
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
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(path, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    // fire-and-forget — telemetry should never break the main flow
  }
}

/** Read all decision logs from a JSONL file (filters out crystallization events) */
export function readDecisionLog(path: string): DecisionLog<string>[] {
  if (!existsSync(path)) return [];
  try {
    const lines = readFileSync(path, 'utf-8').trim().split('\n');
    return lines
      .filter(line => line.length > 0)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter((entry): entry is DecisionLog<string> => {
        if (!entry) return false;
        // Filter out crystallization events (which have string 'event' field)
        if (typeof entry.event === 'string') return false;
        // Also filter by _type discriminator if present
        if ('_type' in entry && (entry as Record<string, unknown>)._type !== 'decision') return false;
        // Must have method and action fields
        return typeof entry.method === 'string' && typeof entry.action === 'string';
      });
  } catch {
    return [];
  }
}

/** Get only LLM decisions (these are candidates for crystallization) */
export function getLlmDecisions(logs: DecisionLog<string>[]): DecisionLog<string>[] {
  return logs.filter(log => log.method === 'llm');
}

/** Crystallization event types */
export type CrystallizationEvent = 'candidate_found' | 'rule_crystallized' | 'rule_removed' | 'distill_complete' | 'rules_compressed' | 'evolution_detected';

interface CrystallizationLog {
  ts: string;
  _type: 'crystallization';
  event: CrystallizationEvent;
  [key: string]: unknown;
}

/** Log a crystallization event (candidate found, rule promoted, rule removed) */
export function logCrystallization(
  path: string,
  event: CrystallizationEvent,
  details: Omit<CrystallizationLog, 'ts' | 'event' | '_type'>,
): void {
  const entry: CrystallizationLog = {
    _type: 'crystallization',
    ts: new Date().toISOString(),
    event,
    ...details,
  };

  try {
    const dir = dirname(path);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    appendFileSync(path, JSON.stringify(entry) + '\n', 'utf-8');
  } catch {
    // fire-and-forget
  }
}
