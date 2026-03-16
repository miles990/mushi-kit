/**
 * myelin
 *
 * Stop paying your LLM to make the same decision twice.
 * Crystallize repeated AI decisions into zero-cost rules.
 *
 * @example
 * ```typescript
 * import { createMyelin } from 'myelin';
 *
 * const myelin = createMyelin({
 *   llm: async (event) => {
 *     const response = await yourLLM.classify(event);
 *     return { action: response.action, reason: response.reason };
 *   },
 * });
 *
 * const result = await myelin.triage({ type: 'timer', context: { idle_seconds: 30 } });
 * // → { action: 'skip', method: 'rule', latencyMs: 0 }
 * ```
 */

import type {
  MyelinConfig,
  Myelin,
  MyelinStats,
  TriageEvent,
  TriageResult,
  Rule,
  Action,
  DefaultAction,
  DecisionLog,
  CrystallizationCandidate,
  Template,
  Methodology,
  DistillResult,
  OptimizeResult,
  EvolutionResult,
} from './types.ts';
import { findMatchingRule, loadRules, saveRules, generateRuleId } from './rules.ts';
import { logDecision, readDecisionLog, logCrystallization } from './telemetry.ts';
import { findCandidates, candidateToRule } from './crystallizer.ts';
import { extractTemplates, mergeTemplateToRuleFromRules } from './templates.ts';
import { extractMethodology, formatMethodology } from './methodology.ts';
import {
  scoreAlignment,
  adjustedThreshold,
  buildGuidance,
  optimizeRules as optimizeRulesFn,
  detectEvolution,
} from './feedback-loop.ts';

// Re-export all types
export type {
  MyelinConfig,
  Myelin,
  MyelinStats,
  TriageEvent,
  TriageResult,
  Rule,
  Action,
  DefaultAction,
  CrystallizationCandidate,
  EventType,
  Method,
  RuleMatch,
  MatchCondition,
  DecisionLog,
  // Layer 2
  Template,
  TemplateInvariants,
  // Layer 3
  Dimension,
  Principle,
  Methodology,
  MatrixCell,
  DistillResult,
  // Closed Loop
  OptimizeResult,
  EvolutionEvent,
  EvolutionResult,
} from './types.ts';

// Re-export utilities for advanced usage
export { matchRule, findMatchingRule, loadRules, saveRules } from './rules.ts';
export { logDecision, readDecisionLog, getLlmDecisions, logCrystallization } from './telemetry.ts';
export { findCandidates, candidateToRule } from './crystallizer.ts';
export { extractTemplates, mergeTemplateToRuleFromRules } from './templates.ts';
export { extractMethodology, formatMethodology } from './methodology.ts';
export { scoreAlignment, adjustedThreshold, buildGuidance, optimizeRules, detectEvolution } from './feedback-loop.ts';
export { startProxy } from './proxy.ts';
export type { ProxyConfig } from './proxy.ts';

const DEFAULT_RULES_PATH = './myelin-rules.json';
const DEFAULT_LOG_PATH = './myelin-decisions.jsonl';
const DEFAULT_MIN_OCCURRENCES = 10;
const DEFAULT_MIN_CONSISTENCY = 0.95;

/**
 * Create a myelin instance.
 *
 * myelin watches your LLM's decisions and promotes stable patterns
 * to zero-cost deterministic rules. Like adaptive immunity becoming innate.
 *
 * @example Default (triage) usage:
 * ```typescript
 * const myelin = createMyelin({ llm: async (event) => ({ action: 'skip', reason: '...' }) });
 * const result = await myelin.triage(event);
 * ```
 *
 * @example Custom actions (e.g. model routing):
 * ```typescript
 * const myelin = createMyelin<'gpt-4' | 'haiku' | 'local'>({
 *   llm: async (event) => ({ action: 'haiku', reason: 'simple query' }),
 * });
 * const result = await myelin.process(event); // → { action: 'haiku', method: 'rule', ... }
 * ```
 */
export function createMyelin<A extends string = DefaultAction>(config: MyelinConfig<A>): Myelin<A> {
  const rulesPath = config.rulesPath ?? DEFAULT_RULES_PATH;
  const logPath = config.logPath ?? DEFAULT_LOG_PATH;
  const autoLog = config.autoLog ?? true;
  const failOpen = config.failOpen ?? true;
  const failOpenAction = config.failOpenAction ?? ('wake' as A);
  const minOccurrences = config.crystallize?.minOccurrences ?? DEFAULT_MIN_OCCURRENCES;
  const minConsistency = config.crystallize?.minConsistency ?? DEFAULT_MIN_CONSISTENCY;

  // Load existing rules
  let rules = loadRules(rulesPath) as Rule<A>[];

  // Stats tracking (in-memory, resets on restart)
  let totalDecisions = 0;
  let ruleDecisions = 0;
  let llmDecisions = 0;
  let errorDecisions = 0;
  let ruleLatencySum = 0;
  let llmLatencySum = 0;

  async function triage(event: TriageEvent): Promise<TriageResult<A>> {
    const start = Date.now();
    totalDecisions++;

    // Phase 1: Try rules (instant, zero-cost)
    const matchedRule = findMatchingRule(event, rules);
    if (matchedRule) {
      matchedRule.hitCount++;
      const latencyMs = Date.now() - start;
      ruleDecisions++;
      ruleLatencySum += latencyMs;

      const result: TriageResult<A> = {
        action: matchedRule.action as A,
        reason: matchedRule.reason,
        method: 'rule',
        latencyMs,
        ruleId: matchedRule.id,
      };

      if (autoLog) {
        logDecision(logPath, event, result.action, result.reason, 'rule', latencyMs);
      }

      return result;
    }

    // Phase 2: Call LLM (expensive, flexible)
    try {
      const llmResult = await config.llm(event);
      const latencyMs = Date.now() - start;
      llmDecisions++;
      llmLatencySum += latencyMs;

      const result: TriageResult<A> = {
        action: llmResult.action,
        reason: llmResult.reason,
        method: 'llm',
        latencyMs,
      };

      if (autoLog) {
        logDecision(logPath, event, result.action, result.reason, 'llm', latencyMs);
      }

      return result;
    } catch (err) {
      // Phase 3: Fail-open (safety net)
      const latencyMs = Date.now() - start;
      errorDecisions++;

      if (!failOpen) throw err;

      const reason = `error: ${err instanceof Error ? err.message : 'unknown'} — fail-open to ${failOpenAction}`;
      const result: TriageResult<A> = {
        action: failOpenAction,
        reason,
        method: 'error',
        latencyMs,
      };

      if (autoLog) {
        logDecision(logPath, event, result.action, reason, 'error', latencyMs);
      }

      return result;
    }
  }

  function getCandidates(opts?: { minOccurrences?: number; minConsistency?: number }): CrystallizationCandidate<A>[] {
    const logs = readDecisionLog(logPath);
    const candidates = findCandidates<A>(logs as DecisionLog<A>[], {
      minOccurrences: opts?.minOccurrences ?? minOccurrences,
      minConsistency: opts?.minConsistency ?? minConsistency,
    });

    for (const c of candidates) {
      logCrystallization(logPath, 'candidate_found', {
        match: c.match,
        action: c.suggestedAction,
        reason: c.description,
        occurrences: c.occurrences,
        consistency: c.consistency,
      });
    }

    return candidates;
  }

  function crystallize(candidate: CrystallizationCandidate<A>): Rule<A> {
    const rule = candidateToRule(candidate);
    rules.push(rule);
    saveRules(rulesPath, rules);

    logCrystallization(logPath, 'rule_crystallized', {
      ruleId: rule.id,
      match: rule.match,
      action: rule.action,
      reason: rule.reason,
      occurrences: candidate.occurrences,
      consistency: candidate.consistency,
    });

    return rule;
  }

  function stats(): MyelinStats {
    return {
      ruleCount: rules.length,
      totalDecisions,
      ruleDecisions,
      llmDecisions,
      errorDecisions,
      ruleCoverage: totalDecisions > 0 ? (ruleDecisions / totalDecisions) * 100 : 0,
      avgRuleLatencyMs: ruleDecisions > 0 ? ruleLatencySum / ruleDecisions : 0,
      avgLlmLatencyMs: llmDecisions > 0 ? llmLatencySum / llmDecisions : 0,
    };
  }

  function getRules(): Rule<A>[] {
    return [...rules];
  }

  function addRule(partial: Omit<Rule<A>, 'id' | 'createdAt' | 'hitCount'>): Rule<A> {
    const rule: Rule<A> = {
      ...partial,
      id: generateRuleId(),
      createdAt: new Date().toISOString(),
      hitCount: 0,
    };
    rules.push(rule);
    saveRules(rulesPath, rules);
    return rule;
  }

  function removeRule(id: string): boolean {
    const idx = rules.findIndex(r => r.id === id);
    if (idx === -1) return false;
    const removed = rules[idx];
    rules.splice(idx, 1);
    saveRules(rulesPath, rules);

    logCrystallization(logPath, 'rule_removed', {
      ruleId: removed.id,
      match: removed.match,
      action: removed.action,
    });

    return true;
  }

  function getTemplates(): Template<A>[] {
    return extractTemplates(rules);
  }

  function getMethodology(): Methodology {
    const templates = getTemplates();
    return extractMethodology(templates, rules);
  }

  function distill(): DistillResult<A> {
    // Layer 1: crystallize pending candidates into rules
    // Use methodology-aware thresholds — aligned patterns need fewer observations
    const currentMethodology = extractMethodology(extractTemplates(rules), rules);
    const logs = readDecisionLog(logPath);

    // First pass: standard thresholds
    const standardCandidates = findCandidates<A>(logs as DecisionLog<A>[], {
      minOccurrences,
      minConsistency,
    });

    // Second pass: methodology-aware thresholds (find patterns standard pass missed)
    const allLlmLogs = logs.filter(l => l.method === 'llm');
    const adjustedCandidates = currentMethodology.principles.length > 0
      ? findCandidates<A>(logs as DecisionLog<A>[], {
          minOccurrences: Math.max(3, Math.round(minOccurrences * 0.5)),
          minConsistency,
        }).filter(c => {
          // Only accept sub-threshold candidates that strongly align with methodology
          const alignment = scoreAlignment(c, currentMethodology);
          const threshold = adjustedThreshold(alignment, minOccurrences);
          return c.occurrences >= threshold && alignment >= 0.4;
        })
      : [];

    // Merge and deduplicate candidates
    const seen = new Set<string>();
    const allCandidates = [...standardCandidates, ...adjustedCandidates].filter(c => {
      const key = `${c.suggestedAction}|${c.match.type}|${c.match.source}|${JSON.stringify(c.match.context)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    for (const candidate of allCandidates) {
      const alreadyCovered = rules.some(r =>
        r.action === candidate.suggestedAction &&
        r.match.type === candidate.match.type &&
        r.match.source === candidate.match.source &&
        JSON.stringify(r.match.context) === JSON.stringify(candidate.match.context),
      );
      if (!alreadyCovered) {
        crystallize(candidate);
      }
    }

    // Layer 2: extract templates from rules
    const templates = extractTemplates(rules);

    // Layer 3: extract methodology from templates
    const methodology = extractMethodology(templates, rules);

    logCrystallization(logPath, 'distill_complete', {
      rules: rules.length,
      templates: templates.length,
      dimensions: methodology.dimensions.length,
      principles: methodology.principles.length,
    });

    return {
      rules: [...rules],
      templates,
      methodology,
      methodologyText: formatMethodology(methodology),
    };
  }

  function optimize(opts?: { minTemplateHits?: number }): OptimizeResult<A> {
    const templates = extractTemplates(rules);
    const result = optimizeRulesFn(rules, templates, {
      minTemplateHits: opts?.minTemplateHits ?? 10,
      minRuleCount: 3,
    });

    if (result.mergedRuleIds.length > 0) {
      // Apply the optimization — replace rules in-memory and persist
      rules = result.rules;
      saveRules(rulesPath, rules);

      logCrystallization(logPath, 'rules_compressed', {
        reason: `Compressed ${result.mergedRuleIds.length} rules into ${result.newMergedRules.length} merged rules (${result.compressionRatio.toFixed(1)}x)`,
      });
    }

    return result;
  }

  function evolve(prev?: Methodology): EvolutionResult<A> {
    // Step 1: Full distillation (crystallize + templates + methodology)
    const distillResult = distill();

    // Step 2: Optimize rules using templates
    const optimized = optimize();

    // Step 3: Re-extract methodology after optimization (rules changed)
    const postOptTemplates = extractTemplates(rules);
    const postOptMethodology = extractMethodology(postOptTemplates, rules);

    // Step 4: Detect evolution
    const events = detectEvolution(prev, postOptMethodology);

    // Step 5: Build guidance for LLM injection
    const guidance = buildGuidance(postOptMethodology);

    if (events.length > 0) {
      logCrystallization(logPath, 'evolution_detected', {
        reason: `${events.length} changes: ${events.map(e => e.type).join(', ')}`,
      });
    }

    return {
      distill: {
        ...distillResult,
        // Update with post-optimization state
        rules: [...rules],
        templates: postOptTemplates,
        methodology: postOptMethodology,
        methodologyText: formatMethodology(postOptMethodology),
      },
      optimized,
      events,
      guidance,
    };
  }

  return {
    process: triage,
    triage,
    getCandidates,
    crystallize,
    stats,
    getRules,
    addRule,
    removeRule,
    getTemplates,
    getMethodology,
    distill,
    optimize,
    evolve,
  };
}
