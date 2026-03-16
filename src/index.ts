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
  Episode,
  EpisodeStep,
  ExperienceRule,
  PromptBlockOptions,
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
  // Episodes & Experience
  Episode,
  EpisodeStep,
  ExperienceRule,
  PromptBlockOptions,
  // Fleet & Stack
  FleetMemberConfig,
  FleetStats,
  MyelinStackConfig,
  StackDistillResult,
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
export { createFleet } from './fleet.ts';
export type { MyelinFleet } from './fleet.ts';
export { createStack } from './stack.ts';
export type { MyelinStack } from './stack.ts';
export { getOrCreate, getInstance, removeInstance, listInstances, clearInstances } from './singleton.ts';

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
  let heuristicDecisions = 0;
  let observeCount = 0;
  let ruleLatencySum = 0;
  let llmLatencySum = 0;
  let heuristicLatencySum = 0;

  // Episode storage (in-memory)
  const episodes: Episode<A>[] = [];
  let episodeIdCounter = 0;

  // maybeDistill tracking
  let lastDistillDecisionCount = 0;
  let lastDistillTimestamp = Date.now();

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

    // Phase 2: Try heuristic (cheap, keyword-based)
    if (config.heuristic) {
      try {
        const heuristicResult = config.heuristic(event);
        if (heuristicResult) {
          const latencyMs = Date.now() - start;
          heuristicDecisions++;
          heuristicLatencySum += latencyMs;

          const result: TriageResult<A> = {
            action: heuristicResult.action,
            reason: heuristicResult.reason,
            method: 'heuristic',
            latencyMs,
          };

          if (autoLog) {
            logDecision(logPath, event, result.action, result.reason, 'heuristic', latencyMs);
          }

          return result;
        }
      } catch {
        // Heuristic failed — fall through to LLM
      }
    }

    // Phase 3: Call LLM (expensive, flexible)
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

  function observe(event: TriageEvent, metadata?: Record<string, unknown>): void {
    observeCount++;
    if (autoLog) {
      const reason = metadata ? JSON.stringify(metadata) : 'observation';
      logDecision(logPath, event, 'observe' as A, reason, 'observe', 0);
    }
  }

  async function triageSafe(event: TriageEvent): Promise<TriageResult<A>> {
    try {
      return await triage(event);
    } catch {
      return {
        action: failOpenAction,
        reason: 'triageSafe: caught error — fail-open',
        method: 'error',
        latencyMs: 0,
      };
    }
  }

  function stats(): MyelinStats {
    return {
      ruleCount: rules.length,
      totalDecisions,
      ruleDecisions,
      llmDecisions,
      heuristicDecisions,
      errorDecisions,
      observeCount,
      ruleCoverage: totalDecisions > 0 ? (ruleDecisions / totalDecisions) * 100 : 0,
      avgRuleLatencyMs: ruleDecisions > 0 ? ruleLatencySum / ruleDecisions : 0,
      avgLlmLatencyMs: llmDecisions > 0 ? llmLatencySum / llmDecisions : 0,
      avgHeuristicLatencyMs: heuristicDecisions > 0 ? heuristicLatencySum / heuristicDecisions : 0,
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

  function toPromptBlock(opts?: PromptBlockOptions): string {
    const format = opts?.format ?? 'xml';
    const includeRules = opts?.includeRules ?? true;
    const includeTemplates = opts?.includeTemplates ?? true;
    const includeMethodology = opts?.includeMethodology ?? true;
    const includeExperience = opts?.includeExperience ?? true;
    const maxRules = opts?.maxRules ?? 10;
    const maxExperienceRules = opts?.maxExperienceRules ?? 5;

    const sections: string[] = [];

    if (includeRules && rules.length > 0) {
      const topRules = [...rules].sort((a, b) => b.hitCount - a.hitCount).slice(0, maxRules);
      if (format === 'xml') {
        sections.push('<crystallized-rules>');
        for (const r of topRules) {
          sections.push(`  <rule id="${r.id}" action="${r.action}" hits="${r.hitCount}">${r.reason}</rule>`);
        }
        sections.push('</crystallized-rules>');
      } else {
        sections.push('## Crystallized Rules');
        for (const r of topRules) {
          sections.push(`- **${r.action}** (${r.hitCount} hits): ${r.reason}`);
        }
      }
    }

    if (includeTemplates) {
      const templates = extractTemplates(rules);
      if (templates.length > 0) {
        if (format === 'xml') {
          sections.push('<templates>');
          for (const t of templates) {
            sections.push(`  <template name="${t.name}" action="${t.action}" rules="${t.ruleCount}" hits="${t.totalHits}" />`);
          }
          sections.push('</templates>');
        } else {
          sections.push('## Templates');
          for (const t of templates) {
            sections.push(`- **${t.name}**: ${t.ruleCount} rules, ${t.totalHits} hits`);
          }
        }
      }
    }

    if (includeMethodology) {
      const templates = extractTemplates(rules);
      const methodology = extractMethodology(templates, rules);
      if (methodology.principles.length > 0) {
        if (format === 'xml') {
          sections.push('<methodology>');
          for (const p of methodology.principles) {
            sections.push(`  <principle confidence="${(p.confidence * 100).toFixed(0)}%">${p.description}</principle>`);
          }
          sections.push('</methodology>');
        } else {
          sections.push('## Methodology');
          for (const p of methodology.principles) {
            sections.push(`- ${p.description} (${(p.confidence * 100).toFixed(0)}%)`);
          }
        }
      }
    }

    if (includeExperience) {
      const expRules = crystallizeEpisodes();
      if (expRules.length > 0) {
        const topExpRules = expRules.slice(0, maxExperienceRules);
        if (format === 'xml') {
          sections.push('<experience-rules>');
          for (const r of topExpRules) {
            sections.push(`  <experience action="${r.action}" confidence="${(r.confidence * 100).toFixed(0)}%" episodes="${r.episodeCount}">${r.pattern}</experience>`);
          }
          sections.push('</experience-rules>');
        } else {
          sections.push('## Experience Rules');
          for (const r of topExpRules) {
            sections.push(`- **${r.action}** (${(r.confidence * 100).toFixed(0)}%, ${r.episodeCount} episodes): ${r.pattern}`);
          }
        }
      }
    }

    return sections.join('\n');
  }

  function recordEpisode(episode: Omit<Episode<A>, 'id'>): Episode<A> {
    const fullEpisode: Episode<A> = {
      ...episode,
      id: `ep_${Date.now()}_${++episodeIdCounter}`,
    };
    episodes.push(fullEpisode);
    return fullEpisode;
  }

  function getEpisodes(): Episode<A>[] {
    return [...episodes];
  }

  function crystallizeEpisodes(opts?: { minEpisodes?: number; minSuccessRate?: number }): ExperienceRule[] {
    const minEps = opts?.minEpisodes ?? 3;
    const minSuccessRate = opts?.minSuccessRate ?? 0.6;

    if (episodes.length < minEps) return [];

    // Group episodes by their action sequence pattern
    const patterns = new Map<string, { episodes: Episode<A>[]; successes: number }>();
    for (const ep of episodes) {
      const actionSequence = ep.steps.map(s => s.result.action).join('→');
      const entry = patterns.get(actionSequence) ?? { episodes: [], successes: 0 };
      entry.episodes.push(ep);
      if (ep.outcome === 'success') entry.successes++;
      patterns.set(actionSequence, entry);
    }

    const experienceRules: ExperienceRule[] = [];
    let ruleIdCounter = 0;

    for (const [pattern, data] of patterns) {
      if (data.episodes.length < minEps) continue;

      const successRate = data.successes / data.episodes.length;
      if (successRate < minSuccessRate) continue;

      // Derive the recommended action from the most common final step
      const finalActions = data.episodes.map(ep => ep.steps[ep.steps.length - 1]?.result.action).filter(Boolean);
      const actionCounts = new Map<string, number>();
      for (const a of finalActions) {
        actionCounts.set(a, (actionCounts.get(a) ?? 0) + 1);
      }
      let bestAction = '';
      let bestCount = 0;
      for (const [action, count] of actionCounts) {
        if (count > bestCount) { bestAction = action; bestCount = count; }
      }

      experienceRules.push({
        id: `exp_${Date.now()}_${++ruleIdCounter}`,
        pattern,
        action: bestAction,
        confidence: successRate * (data.episodes.length / episodes.length),
        episodeCount: data.episodes.length,
        successRate,
        counterExamples: data.episodes.length - data.successes,
      });
    }

    return experienceRules.sort((a, b) => b.confidence - a.confidence);
  }

  function maybeDistill(opts?: { minNewDecisions?: number; minIntervalMs?: number }): DistillResult<A> | null {
    const minNew = opts?.minNewDecisions ?? 50;
    const minInterval = opts?.minIntervalMs ?? 30 * 60 * 1000; // 30 minutes

    const newDecisions = totalDecisions - lastDistillDecisionCount;
    const elapsed = Date.now() - lastDistillTimestamp;

    if (newDecisions < minNew && elapsed < minInterval) return null;

    const result = distill();
    lastDistillDecisionCount = totalDecisions;
    lastDistillTimestamp = Date.now();
    return result;
  }

  function toSmallModelPrompt(): string {
    const templates = extractTemplates(rules);
    const methodology = extractMethodology(templates, rules);
    const lines: string[] = [];

    lines.push('RULES:');
    if (methodology.principles.length > 0) {
      for (const p of methodology.principles.slice(0, 5)) {
        lines.push(`- WHEN ${p.when} THEN ${p.then}`);
      }
    }

    if (rules.length > 0) {
      const topRules = [...rules].sort((a, b) => b.hitCount - a.hitCount).slice(0, 5);
      lines.push('TOP PATTERNS:');
      for (const r of topRules) {
        lines.push(`- ${r.action}: ${r.reason.slice(0, 80)}`);
      }
    }

    return lines.join('\n');
  }

  return {
    process: triage,
    triage,
    observe,
    triageSafe,
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
    toPromptBlock,
    recordEpisode,
    getEpisodes,
    crystallizeEpisodes,
    maybeDistill,
    toSmallModelPrompt,
  };
}
