/**
 * myelin — Crystallizer
 *
 * Detects stable patterns in LLM decisions and promotes them to rules.
 * Think of it as adaptive immunity becoming innate immunity.
 *
 * The LLM handles novel threats; rules handle everything it's seen before.
 */
import type { DecisionLog, CrystallizationCandidate, Rule } from './types.ts';
/**
 * Analyze LLM decision logs and find stable patterns.
 *
 * A pattern is "stable" when:
 * 1. It's been seen at least minOccurrences times
 * 2. The LLM returned the same action at least minConsistency% of the time
 */
export declare function findCandidates<A extends string>(logs: DecisionLog<A>[], opts: {
    minOccurrences: number;
    minConsistency: number;
    methods?: string[];
}): CrystallizationCandidate<A>[];
/** Promote a candidate to a rule */
export declare function candidateToRule<A extends string>(candidate: CrystallizationCandidate<A>): Rule<A>;
//# sourceMappingURL=crystallizer.d.ts.map