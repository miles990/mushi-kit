/**
 * myelin — Telemetry
 *
 * Logs every decision for analysis and crystallization.
 * Append-only JSONL format — human-readable, grep-friendly.
 */
import type { DecisionLog, TriageEvent, Method } from './types.ts';
/** Append a decision to the log file */
export declare function logDecision(path: string, event: TriageEvent, action: string, reason: string, method: Method, latencyMs: number): void;
/** Read all decision logs from a JSONL file (filters out crystallization events) */
export declare function readDecisionLog(path: string): DecisionLog<string>[];
/** Get only LLM decisions (these are candidates for crystallization) */
export declare function getLlmDecisions(logs: DecisionLog<string>[]): DecisionLog<string>[];
/** Crystallization event types */
export type CrystallizationEvent = 'candidate_found' | 'rule_crystallized' | 'rule_removed' | 'distill_complete' | 'rules_compressed' | 'evolution_detected';
interface CrystallizationLog {
    ts: string;
    _type: 'crystallization';
    event: CrystallizationEvent;
    [key: string]: unknown;
}
/** Log a crystallization event (candidate found, rule promoted, rule removed) */
export declare function logCrystallization(path: string, event: CrystallizationEvent, details: Omit<CrystallizationLog, 'ts' | 'event' | '_type'>): void;
export {};
//# sourceMappingURL=telemetry.d.ts.map