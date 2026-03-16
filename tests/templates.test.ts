import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractTemplates, mergeTemplateToRuleFromRules } from '../src/templates.ts';
import type { Rule } from '../src/types.ts';

function makeRule(overrides: Partial<Rule> = {}): Rule {
  return {
    id: `rule_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    match: { type: 'timer', context: { idle_seconds: { lte: 300 }, changed: false } },
    action: 'skip',
    reason: 'crystallized',
    createdAt: new Date().toISOString(),
    hitCount: 10,
    ...overrides,
  };
}

describe('extractTemplates', () => {
  it('returns empty for no rules', () => {
    const result = extractTemplates([]);
    assert.deepEqual(result, []);
  });

  it('returns empty when below minRules threshold', () => {
    const rules = [makeRule({ id: 'r1' })];
    const result = extractTemplates(rules, { minRules: 2 });
    assert.deepEqual(result, []);
  });

  it('groups rules with the same fingerprint into a template', () => {
    const rules = [
      makeRule({ id: 'r1', hitCount: 5 }),
      makeRule({ id: 'r2', hitCount: 15 }),
    ];
    const result = extractTemplates(rules);
    assert.equal(result.length, 1);
    assert.equal(result[0].ruleCount, 2);
    assert.equal(result[0].action, 'skip');
    assert.deepEqual(result[0].ruleIds.sort(), ['r1', 'r2'].sort());
    assert.equal(result[0].totalHits, 20);
  });

  it('separates rules with different actions', () => {
    const rules = [
      makeRule({ id: 'r1', action: 'skip' }),
      makeRule({ id: 'r2', action: 'skip' }),
      makeRule({ id: 'r3', action: 'wake', match: { type: 'timer', context: { idle_seconds: { lte: 300 }, changed: false } } }),
      makeRule({ id: 'r4', action: 'wake', match: { type: 'timer', context: { idle_seconds: { lte: 300 }, changed: false } } }),
    ];
    const result = extractTemplates(rules);
    assert.equal(result.length, 2);
    const actions = new Set(result.map(t => t.action));
    assert.ok(actions.has('skip'));
    assert.ok(actions.has('wake'));
  });

  it('separates rules with different context structures', () => {
    const rules = [
      makeRule({ id: 'r1', match: { type: 'pr', context: { lines: { lte: 50 }, deps_only: true } } }),
      makeRule({ id: 'r2', match: { type: 'pr', context: { lines: { lte: 50 }, deps_only: true } } }),
      makeRule({ id: 'r3', match: { type: 'pr', context: { severity: 'low' } } }),
      makeRule({ id: 'r4', match: { type: 'pr', context: { severity: 'low' } } }),
    ];
    const result = extractTemplates(rules);
    assert.equal(result.length, 2);
  });

  it('extracts correct invariants', () => {
    const rules = [
      makeRule({ id: 'r1', match: { type: 'alert', source: 'github', context: { is_bot: true, lines: { lte: 50 } } } }),
      makeRule({ id: 'r2', match: { type: 'alert', source: 'github', context: { is_bot: true, lines: { lte: 100 } } } }),
    ];
    const result = extractTemplates(rules);
    assert.equal(result.length, 1);

    const tmpl = result[0];
    assert.equal(tmpl.invariants.eventType, 'alert');
    assert.equal(tmpl.invariants.source, 'github');
    assert.equal(tmpl.invariants.stableContext.is_bot, 'boolean');
    assert.equal(tmpl.invariants.stableContext.lines, 'numeric_range');
  });

  it('identifies variable context keys', () => {
    const rules = [
      makeRule({ id: 'r1', match: { type: 'pr', context: { lines: { lte: 50 }, author: 'bot-a' } } }),
      makeRule({ id: 'r2', match: { type: 'pr', context: { lines: { lte: 50 }, author: 'bot-b' } } }),
    ];
    const result = extractTemplates(rules);
    assert.equal(result.length, 1);

    // 'lines' is stable (same type), 'author' is also stable (same type: exact_string)
    // But the values differ — that's fine, the fingerprint groups on structure
    assert.equal(result[0].invariants.stableContext.lines, 'numeric_range');
    assert.equal(result[0].invariants.stableContext.author, 'exact_string');
  });

  it('sorts templates by totalHits descending', () => {
    const rules = [
      makeRule({ id: 'r1', action: 'skip', hitCount: 5 }),
      makeRule({ id: 'r2', action: 'skip', hitCount: 5 }),
      makeRule({ id: 'r3', action: 'wake', hitCount: 50,
        match: { type: 'message', context: { idle_seconds: { lte: 300 }, changed: false } } }),
      makeRule({ id: 'r4', action: 'wake', hitCount: 50,
        match: { type: 'message', context: { idle_seconds: { lte: 300 }, changed: false } } }),
    ];
    const result = extractTemplates(rules);
    assert.equal(result.length, 2);
    assert.ok(result[0].totalHits >= result[1].totalHits);
  });

  it('generates meaningful template names', () => {
    const rules = [
      makeRule({ id: 'r1', match: { type: 'alert', source: 'github', context: { is_bot: true } } }),
      makeRule({ id: 'r2', match: { type: 'alert', source: 'github', context: { is_bot: true } } }),
    ];
    const result = extractTemplates(rules);
    assert.ok(result[0].name.includes('alert'));
    assert.ok(result[0].name.includes('github'));
    assert.ok(result[0].name.includes('skip'));
  });
});

describe('mergeTemplateToRuleFromRules', () => {
  it('creates a merged rule from a template', () => {
    const rules: Rule[] = [
      makeRule({ id: 'r1', match: { type: 'alert', source: 'github', context: { is_bot: true, lines: { lte: 50 } } } }),
      makeRule({ id: 'r2', match: { type: 'alert', source: 'github', context: { is_bot: true, lines: { lte: 100 } } } }),
    ];
    const templates = extractTemplates(rules);
    assert.equal(templates.length, 1);

    const merged = mergeTemplateToRuleFromRules(templates[0], rules);
    assert.ok(merged.id.startsWith('merged_'));
    assert.equal(merged.action, 'skip');
    assert.equal(merged.match.type, 'alert');
    assert.equal(merged.match.source, 'github');
    assert.ok(merged.match.context);
    assert.equal(merged.match.context!.is_bot, true);
    // Should use the widest range (lte: 100 covers both)
    assert.deepEqual(merged.match.context!.lines, { lte: 100 });
  });

  it('drops context for templates with no stable context', () => {
    const rules: Rule[] = [
      makeRule({ id: 'r1', match: { type: 'timer' }, action: 'skip' }),
      makeRule({ id: 'r2', match: { type: 'timer' }, action: 'skip' }),
    ];
    const templates = extractTemplates(rules);
    const merged = mergeTemplateToRuleFromRules(templates[0], rules);
    assert.equal(merged.match.type, 'timer');
    assert.equal(merged.match.context, undefined);
  });
});
