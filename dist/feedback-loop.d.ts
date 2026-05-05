/**
 * myelin — Feedback Loop (Closed-Loop Mechanics)
 *
 * The missing piece that connects the three layers into a self-reinforcing cycle:
 *
 * Layer 1 (rules) → Layer 2 (templates) → Layer 3 (methodology)
 *    ↑                    ↑                    ↓
 *    └── accelerated      └── compression      └── guidance + threshold adjustment
 *        crystallization      (N rules → 1)
 *
 * The loop: more decisions → more rules → templates emerge → methodology crystallizes
 * → methodology lowers thresholds for aligned patterns → faster crystallization
 * → fewer LLM calls → remaining calls are novel → new rules → updated methodology
 */
import type { Rule, CrystallizationCandidate, Methodology, Template, EvolutionEvent, OptimizeResult } from './types.ts';
/**
 * Score how well a crystallization candidate aligns with existing methodology.
 *
 * A candidate that fits an existing principle is more trustworthy —
 * it's not a new pattern, it's a variation of a known pattern.
 *
 * Returns 0 (no alignment) to 1 (perfect alignment).
 */
export declare function scoreAlignment<A extends string>(candidate: CrystallizationCandidate<A>, methodology: Methodology): number;
/**
 * Adjust crystallization thresholds based on methodology alignment.
 *
 * The key insight: if a candidate aligns with an existing principle,
 * it needs fewer observations to be trusted. The methodology has
 * already validated this type of decision.
 *
 * Alignment 0.0 → no adjustment (use base thresholds)
 * Alignment 0.5 → 25% reduction (e.g., 10 → 8 occurrences)
 * Alignment 1.0 → 50% reduction (e.g., 10 → 5 occurrences)
 *
 * minConsistency is never reduced — we always demand consistency.
 */
export declare function adjustedThreshold(alignment: number, baseMinOccurrences: number): number;
/**
 * Build LLM guidance text from methodology.
 *
 * This is the Layer 3 → Layer 1 feedback:
 * inject the methodology into the LLM's context so it makes
 * more consistent decisions from the start.
 *
 * Returns a string suitable for inclusion in an LLM system prompt.
 */
export declare function buildGuidance(methodology: Methodology): string;
/**
 * Compress rules using templates.
 *
 * When a template covers N rules with the same action and strong hit count,
 * replace those N rules with a single broader merged rule.
 *
 * This is Layer 2 → Layer 1 optimization: the rule table shrinks,
 * matching is faster, and the system is more general.
 */
export declare function optimizeRules<A extends string>(rules: Rule<A>[], templates: Template<A>[], opts?: {
    minTemplateHits?: number;
    minRuleCount?: number;
}): OptimizeResult<A>;
/**
 * Detect evolution between two methodology snapshots.
 *
 * This is the system's self-awareness: it knows what it learned
 * and what it forgot between distillation cycles.
 */
export declare function detectEvolution(prev: Methodology | undefined, next: Methodology): EvolutionEvent[];
//# sourceMappingURL=feedback-loop.d.ts.map