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
import type { MyelinConfig, Myelin, DefaultAction } from './types.ts';
export type { MyelinConfig, Myelin, MyelinStats, TriageEvent, TriageResult, Rule, Action, DefaultAction, CrystallizationCandidate, EventType, Method, RuleMatch, MatchCondition, DecisionLog, Template, TemplateInvariants, Dimension, Principle, Methodology, MatrixCell, DistillResult, OptimizeResult, EvolutionEvent, EvolutionResult, Episode, EpisodeStep, ExperienceRule, PromptBlockOptions, FleetMemberConfig, FleetStats, MyelinStackConfig, StackDistillResult, } from './types.ts';
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
export declare function createMyelin<A extends string = DefaultAction>(config: MyelinConfig<A>): Myelin<A>;
//# sourceMappingURL=index.d.ts.map