/**
 * myelin — Layer 2: Templates
 *
 * Groups similar rules into abstract decision templates.
 * Same algorithm as Layer 1 crystallizer, applied recursively to rules.
 *
 * Layer 1: events → fingerprint → rules
 * Layer 2: rules → meta-fingerprint → templates
 */

import type { Rule, Template, TemplateInvariants, MatchCondition } from './types.ts';

let templateIdCounter = 0;

/** Generate a unique template ID */
function generateTemplateId(): string {
  return `tmpl_${Date.now()}_${++templateIdCounter}`;
}

/**
 * Classify a match condition's type.
 * This is the "meta-fingerprint" — we look at the *shape* of the condition,
 * not its value. Same principle as eventFingerprint() in Layer 1.
 */
function conditionType(condition: MatchCondition): 'boolean' | 'numeric_range' | 'exact_string' | 'pattern' {
  if (typeof condition === 'boolean') return 'boolean';
  if (typeof condition === 'number') return 'numeric_range';
  if (typeof condition === 'string') return 'exact_string';
  if (typeof condition === 'object' && condition !== null) {
    if ('pattern' in condition) return 'pattern';
    return 'numeric_range'; // { lt, lte, gt, gte }
  }
  return 'exact_string';
}

/**
 * Generate a structural fingerprint for a rule.
 * Two rules with the same fingerprint are "the same kind of rule".
 *
 * Keys on: action + event type + context key names + condition types.
 * Values are ignored — we care about shape, not content.
 */
function ruleFingerprint<A extends string>(rule: Rule<A>): string {
  const parts: string[] = [`action:${rule.action}`];

  if (rule.match.type) {
    parts.push(`type:${rule.match.type}`);
  }

  if (rule.match.source) {
    parts.push('has_source');
  }

  if (rule.match.context) {
    const keys = Object.keys(rule.match.context).sort();
    for (const key of keys) {
      const ct = conditionType(rule.match.context[key]);
      parts.push(`${key}:${ct}`);
    }
  }

  return parts.join('|');
}

/**
 * Extract invariants from a group of similar rules.
 * Invariants = what's structurally identical across ALL rules in the group.
 */
function extractInvariants<A extends string>(rules: Rule<A>[]): TemplateInvariants {
  const invariants: TemplateInvariants = { stableContext: {} };

  // Event type: stable if all rules share the same type
  const types = new Set(rules.map(r => r.match.type).filter(Boolean));
  if (types.size === 1) {
    invariants.eventType = [...types][0];
  }

  // Source: stable if all rules share the same source
  const sources = new Set(rules.map(r => r.match.source).filter(Boolean));
  if (sources.size === 1) {
    invariants.source = [...sources][0];
  }

  // Context: find keys present in ALL rules with the same condition type
  if (rules.every(r => r.match.context)) {
    // Collect all context keys
    const allKeys = new Set<string>();
    for (const rule of rules) {
      if (rule.match.context) {
        for (const key of Object.keys(rule.match.context)) {
          allKeys.add(key);
        }
      }
    }

    for (const key of allKeys) {
      // Check if this key is present in ALL rules
      const valuesForKey = rules
        .map(r => r.match.context?.[key])
        .filter(v => v !== undefined);

      if (valuesForKey.length !== rules.length) continue;

      // Check if all have the same condition type
      const types = new Set(valuesForKey.map(v => conditionType(v as MatchCondition)));
      if (types.size === 1) {
        invariants.stableContext[key] = [...types][0] as 'boolean' | 'numeric_range' | 'exact_string' | 'pattern';
      }
    }
  }

  return invariants;
}

/**
 * Find variable context keys — keys that appear in some rules but not all,
 * or keys with the same name but different condition types.
 */
function findVariables<A extends string>(rules: Rule<A>[], stableKeys: Set<string>): string[] {
  const allKeys = new Set<string>();
  for (const rule of rules) {
    if (rule.match.context) {
      for (const key of Object.keys(rule.match.context)) {
        allKeys.add(key);
      }
    }
  }

  return [...allKeys].filter(k => !stableKeys.has(k)).sort();
}

/**
 * Generate a human-readable template name from its invariants and action.
 */
function generateTemplateName<A extends string>(action: A, invariants: TemplateInvariants, ruleCount: number): string {
  const parts: string[] = [];

  if (invariants.eventType) {
    parts.push(invariants.eventType);
  }

  if (invariants.source) {
    parts.push(`from ${invariants.source}`);
  }

  const stableKeys = Object.keys(invariants.stableContext);
  if (stableKeys.length > 0) {
    parts.push(`with ${stableKeys.join(', ')}`);
  }

  const prefix = parts.length > 0 ? parts.join(' ') : `${ruleCount} rules`;
  return `${prefix} → ${action}`;
}

/**
 * Extract templates from rules.
 *
 * This is the Layer 2 crystallization:
 * - fingerprint each rule (like eventFingerprint for events)
 * - group by fingerprint
 * - groups with ≥ minRules rules become templates
 * - extract invariants (what's always the same) and variables (what differs)
 */
export function extractTemplates<A extends string>(
  rules: Rule<A>[],
  opts: { minRules?: number } = {},
): Template<A>[] {
  const minRules = opts.minRules ?? 2;

  // Group rules by fingerprint
  const groups = new Map<string, Rule<A>[]>();
  for (const rule of rules) {
    const fp = ruleFingerprint(rule);
    const group = groups.get(fp) ?? [];
    group.push(rule);
    groups.set(fp, group);
  }

  const templates: Template<A>[] = [];

  for (const [, group] of groups) {
    if (group.length < minRules) continue;

    const action = group[0].action; // Same by fingerprint design
    const invariants = extractInvariants(group);
    const stableKeys = new Set(Object.keys(invariants.stableContext));
    const variables = findVariables(group, stableKeys);
    const totalHits = group.reduce((sum, r) => sum + r.hitCount, 0);

    templates.push({
      id: generateTemplateId(),
      name: generateTemplateName(action, invariants, group.length),
      ruleIds: group.map(r => r.id),
      action,
      invariants,
      variables,
      ruleCount: group.length,
      totalHits,
      createdAt: new Date().toISOString(),
    });
  }

  // Sort by total hits (most impactful first)
  return templates.sort((a, b) => b.totalHits - a.totalHits);
}

/**
 * Merge a template's rules into a single broader rule.
 * The merged rule matches on invariants only (dropping variable conditions).
 * This is optional compression — trades precision for simplicity.
 *
 * Returns the merged rule (doesn't modify the original rules array).
 */
export function mergeTemplateToRule<A extends string>(template: Template<A>): Rule<A> {
  const match: Rule<A>['match'] = {};

  if (template.invariants.eventType) {
    match.type = template.invariants.eventType;
  }

  if (template.invariants.source) {
    match.source = template.invariants.source;
  }

  // Only include stable context keys (skip variables)
  // We use the broadest possible conditions
  if (Object.keys(template.invariants.stableContext).length > 0) {
    match.context = {};
    // Note: the merged rule matches on structure, not specific values.
    // For boolean invariants, we need a value — but we can't know which
    // without the original rules. This function is called with template data only.
    // For practical use, call mergeTemplateToRuleFromRules() instead.
  }

  return {
    id: `merged_${template.id}`,
    match,
    action: template.action,
    reason: `merged from template "${template.name}" (${template.ruleCount} rules, ${template.totalHits} total hits)`,
    createdAt: new Date().toISOString(),
    hitCount: 0,
  };
}

/**
 * Merge a template's rules into a single broader rule,
 * using the original rules for context value derivation.
 */
export function mergeTemplateToRuleFromRules<A extends string>(
  template: Template<A>,
  rules: Rule<A>[],
): Rule<A> {
  const templateRules = rules.filter(r => template.ruleIds.includes(r.id));
  const match: Rule<A>['match'] = {};

  if (template.invariants.eventType) {
    match.type = template.invariants.eventType;
  }

  if (template.invariants.source) {
    match.source = template.invariants.source;
  }

  // For stable context: derive the broadest condition that covers all rules
  const stableKeys = Object.keys(template.invariants.stableContext);
  if (stableKeys.length > 0) {
    const context: Record<string, MatchCondition> = {};

    for (const key of stableKeys) {
      const condType = template.invariants.stableContext[key];
      const values = templateRules
        .map(r => r.match.context?.[key])
        .filter(v => v !== undefined);

      if (values.length === 0) continue;

      switch (condType) {
        case 'boolean': {
          // All booleans the same → use that value
          const bools = new Set(values as boolean[]);
          if (bools.size === 1) {
            context[key] = [...bools][0];
          }
          break;
        }
        case 'numeric_range': {
          // Find the widest range that covers all rules
          let maxLte = -Infinity;
          for (const v of values) {
            if (typeof v === 'number') {
              maxLte = Math.max(maxLte, v);
            } else if (typeof v === 'object' && v !== null && 'lte' in v) {
              maxLte = Math.max(maxLte, (v as { lte: number }).lte);
            }
          }
          if (maxLte !== -Infinity) {
            context[key] = { lte: maxLte };
          }
          break;
        }
        case 'exact_string': {
          // If all same → exact match; if different → skip (too narrow)
          const strs = new Set(values as string[]);
          if (strs.size === 1) {
            context[key] = [...strs][0];
          }
          // If strings differ, this key is actually variable, not stable
          break;
        }
        case 'pattern': {
          // Keep the first pattern (they should be structurally similar)
          const first = values[0];
          if (typeof first === 'object' && first !== null && 'pattern' in first) {
            context[key] = first as { pattern: string };
          }
          break;
        }
      }
    }

    if (Object.keys(context).length > 0) {
      match.context = context;
    }
  }

  return {
    id: `merged_${template.id}`,
    match,
    action: template.action,
    reason: `merged from template "${template.name}" (${template.ruleCount} rules, ${template.totalHits} total hits)`,
    createdAt: new Date().toISOString(),
    hitCount: 0,
  };
}
