/**
 * myelin — Layer 2: Templates
 *
 * Groups similar rules into abstract decision templates.
 * Same algorithm as Layer 1 crystallizer, applied recursively to rules.
 *
 * Layer 1: events → fingerprint → rules
 * Layer 2: rules → meta-fingerprint → templates
 */
import type { Rule, Template } from './types.ts';
/**
 * Extract templates from rules.
 *
 * This is the Layer 2 crystallization:
 * - fingerprint each rule (like eventFingerprint for events)
 * - group by fingerprint
 * - groups with ≥ minRules rules become templates
 * - extract invariants (what's always the same) and variables (what differs)
 */
export declare function extractTemplates<A extends string>(rules: Rule<A>[], opts?: {
    minRules?: number;
}): Template<A>[];
/**
 * Merge a template's rules into a single broader rule.
 * The merged rule matches on invariants only (dropping variable conditions).
 * This is optional compression — trades precision for simplicity.
 *
 * Returns the merged rule (doesn't modify the original rules array).
 */
export declare function mergeTemplateToRule<A extends string>(template: Template<A>): Rule<A>;
/**
 * Merge a template's rules into a single broader rule,
 * using the original rules for context value derivation.
 */
export declare function mergeTemplateToRuleFromRules<A extends string>(template: Template<A>, rules: Rule<A>[]): Rule<A>;
//# sourceMappingURL=templates.d.ts.map