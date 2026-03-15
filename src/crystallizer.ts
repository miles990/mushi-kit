/**
 * mushi-kit — Crystallizer
 *
 * Detects stable patterns in LLM decisions and promotes them to rules.
 * Think of it as adaptive immunity becoming innate immunity.
 *
 * The LLM handles novel threats; rules handle everything it's seen before.
 */

import type { DecisionLog, CrystallizationCandidate, Rule, RuleMatch, Action } from './types.ts';
import { generateRuleId } from './rules.ts';

/**
 * Generate a fingerprint for an event's structural pattern.
 * Two events with the same fingerprint are considered "the same kind of event".
 *
 * We key on: event type + source + context keys (not values, since values vary).
 * For numeric context values, we bucket them into ranges.
 */
function eventFingerprint(log: DecisionLog): string {
  const parts: string[] = [log.event.type];

  if (log.event.source) {
    parts.push(`src:${log.event.source}`);
  }

  if (log.event.context) {
    const contextKeys = Object.keys(log.event.context).sort();
    for (const key of contextKeys) {
      const val = log.event.context[key];
      if (typeof val === 'boolean') {
        parts.push(`${key}:${val}`);
      } else if (typeof val === 'number') {
        // Bucket numeric values into ranges for pattern detection
        const bucket = numericBucket(val);
        parts.push(`${key}:${bucket}`);
      } else if (typeof val === 'string') {
        // For strings, use a length category rather than the value
        parts.push(`${key}:str${val.length > 100 ? '_long' : '_short'}`);
      }
      // Skip complex types
    }
  }

  return parts.join('|');
}

/** Bucket a numeric value into a human-readable range */
function numericBucket(val: number): string {
  if (val <= 0) return '<=0';
  if (val <= 60) return '<=1min';
  if (val <= 300) return '<=5min';
  if (val <= 1800) return '<=30min';
  if (val <= 3600) return '<=1h';
  return '>1h';
}

/** Build a RuleMatch from a group of similar events */
function buildMatchFromGroup(logs: DecisionLog[]): RuleMatch {
  const match: RuleMatch = {};
  const first = logs[0].event;

  // All events in a group share the same type
  match.type = first.type;

  // If all share the same source, include it
  const sources = new Set(logs.map(l => l.event.source).filter(Boolean));
  if (sources.size === 1) {
    match.source = [...sources][0];
  }

  // For context keys, find stable patterns
  if (first.context) {
    const contextConditions: Record<string, unknown> = {};
    const keys = Object.keys(first.context);

    for (const key of keys) {
      const values = logs
        .map(l => l.event.context?.[key])
        .filter(v => v !== undefined);

      if (values.length === 0) continue;

      // All boolean values the same → exact match
      if (values.every(v => typeof v === 'boolean')) {
        const boolValues = new Set(values as boolean[]);
        if (boolValues.size === 1) {
          contextConditions[key] = [...boolValues][0];
        }
      }

      // All numeric → derive a range
      if (values.every(v => typeof v === 'number')) {
        const nums = values as number[];
        const min = Math.min(...nums);
        const max = Math.max(...nums);
        // Use the bucket boundary that covers all observed values
        const upperBound = numericUpperBound(max);
        if (min >= 0) {
          contextConditions[key] = { lte: upperBound };
        }
      }
    }

    if (Object.keys(contextConditions).length > 0) {
      match.context = contextConditions as Record<string, import('./types.ts').MatchCondition>;
    }
  }

  return match;
}

/** Get the next bucket boundary above a value */
function numericUpperBound(val: number): number {
  if (val <= 60) return 60;
  if (val <= 300) return 300;
  if (val <= 1800) return 1800;
  if (val <= 3600) return 3600;
  return Math.ceil(val / 3600) * 3600;
}

/**
 * Analyze LLM decision logs and find stable patterns.
 *
 * A pattern is "stable" when:
 * 1. It's been seen at least minOccurrences times
 * 2. The LLM returned the same action at least minConsistency% of the time
 */
export function findCandidates(
  logs: DecisionLog[],
  opts: { minOccurrences: number; minConsistency: number },
): CrystallizationCandidate[] {
  // Only analyze LLM decisions (rules are already crystallized)
  const llmLogs = logs.filter(l => l.method === 'llm');

  // Group by fingerprint
  const groups = new Map<string, DecisionLog[]>();
  for (const log of llmLogs) {
    const fp = eventFingerprint(log);
    const group = groups.get(fp) ?? [];
    group.push(log);
    groups.set(fp, group);
  }

  const candidates: CrystallizationCandidate[] = [];

  for (const [, group] of groups) {
    if (group.length < opts.minOccurrences) continue;

    // Count actions
    const actionCounts = new Map<string, number>();
    for (const log of group) {
      actionCounts.set(log.action, (actionCounts.get(log.action) ?? 0) + 1);
    }

    // Find the dominant action
    let dominantAction = 'wake' as Action;
    let maxCount = 0;
    for (const [action, count] of actionCounts) {
      if (count > maxCount) {
        dominantAction = action as Action;
        maxCount = count;
      }
    }

    const consistency = maxCount / group.length;
    if (consistency < opts.minConsistency) continue;

    // Build the candidate
    const match = buildMatchFromGroup(group);
    const sampleReasons = [...new Set(
      group
        .filter(l => l.action === dominantAction)
        .map(l => l.reason)
        .slice(0, 5),
    )];

    candidates.push({
      match,
      suggestedAction: dominantAction,
      description: describeMatch(match, dominantAction),
      occurrences: group.length,
      consistency,
      sampleReasons,
    });
  }

  // Sort by occurrences (most common first)
  return candidates.sort((a, b) => b.occurrences - a.occurrences);
}

/** Generate a human-readable description of a match pattern */
function describeMatch(match: RuleMatch, action: Action): string {
  const parts: string[] = [];
  if (match.type) parts.push(`type=${match.type}`);
  if (match.source) parts.push(`source=${match.source}`);
  if (match.context) {
    for (const [key, val] of Object.entries(match.context)) {
      if (typeof val === 'object' && val !== null && !('pattern' in val)) {
        const range = val as { lt?: number; lte?: number; gt?: number; gte?: number };
        const conditions: string[] = [];
        if (range.lte != null) conditions.push(`<=${range.lte}`);
        if (range.gte != null) conditions.push(`>=${range.gte}`);
        if (range.lt != null) conditions.push(`<${range.lt}`);
        if (range.gt != null) conditions.push(`>${range.gt}`);
        parts.push(`${key} ${conditions.join(' ')}`);
      } else {
        parts.push(`${key}=${val}`);
      }
    }
  }
  return `${action} when ${parts.join(', ')}`;
}

/** Promote a candidate to a rule */
export function candidateToRule(candidate: CrystallizationCandidate): Rule {
  return {
    id: generateRuleId(),
    match: candidate.match,
    action: candidate.suggestedAction,
    reason: `crystallized: ${candidate.description} (${candidate.occurrences} occurrences, ${(candidate.consistency * 100).toFixed(1)}% consistency)`,
    createdAt: new Date().toISOString(),
    hitCount: 0,
  };
}
