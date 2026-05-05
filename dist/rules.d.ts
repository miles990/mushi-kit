/**
 * myelin — Rule Engine
 *
 * Matches events against crystallized rules.
 * Rules are deterministic, instant (0ms), and zero-cost.
 */
import type { Rule, RuleMatch, TriageEvent } from './types.ts';
/** Generate a unique rule ID */
export declare function generateRuleId(): string;
/** Check if an event matches a rule's conditions */
export declare function matchRule(event: TriageEvent, match: RuleMatch): boolean;
/** Find the first matching rule for an event */
export declare function findMatchingRule<A extends string>(event: TriageEvent, rules: Rule<A>[]): Rule<A> | null;
/** Load rules from a JSON file */
export declare function loadRules(path: string): Rule[];
/** Save rules to a JSON file */
export declare function saveRules<A extends string>(path: string, rules: Rule<A>[]): void;
//# sourceMappingURL=rules.d.ts.map