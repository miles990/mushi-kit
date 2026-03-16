import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { extractMethodology, formatMethodology } from '../src/methodology.ts';
import { extractTemplates } from '../src/templates.ts';
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

describe('extractMethodology', () => {
  it('returns empty methodology for no templates', () => {
    const result = extractMethodology([], []);
    assert.equal(result.dimensions.length, 0);
    assert.equal(result.principles.length, 0);
    assert.equal(result.matrix.length, 0);
    assert.equal(result.templateCount, 0);
  });

  it('extracts dimensions from templates', () => {
    const rules: Rule[] = [
      makeRule({ id: 'r1', match: { type: 'alert', context: { is_bot: true, lines: { lte: 50 } } } }),
      makeRule({ id: 'r2', match: { type: 'alert', context: { is_bot: true, lines: { lte: 100 } } } }),
      makeRule({ id: 'r3', action: 'wake',
        match: { type: 'message', context: { is_bot: false, lines: { lte: 200 } } } }),
      makeRule({ id: 'r4', action: 'wake',
        match: { type: 'message', context: { is_bot: false, lines: { lte: 300 } } } }),
    ];
    const templates = extractTemplates(rules);
    const methodology = extractMethodology(templates, rules);

    assert.ok(methodology.dimensions.length > 0);

    // Both templates use 'is_bot' and 'lines', so they should be dimensions
    const dimNames = methodology.dimensions.map(d => d.name);
    assert.ok(dimNames.includes('is_bot'));
    assert.ok(dimNames.includes('lines'));
  });

  it('weights dimensions by template coverage', () => {
    const rules: Rule[] = [
      // Group 1: uses is_bot + lines (2 rules)
      makeRule({ id: 'r1', match: { type: 'alert', context: { is_bot: true, lines: { lte: 50 } } } }),
      makeRule({ id: 'r2', match: { type: 'alert', context: { is_bot: true, lines: { lte: 100 } } } }),
      // Group 2: uses only lines (2 rules, different structure)
      makeRule({ id: 'r3', action: 'wake',
        match: { type: 'alert', context: { lines: { lte: 200 } } } }),
      makeRule({ id: 'r4', action: 'wake',
        match: { type: 'alert', context: { lines: { lte: 300 } } } }),
    ];
    const templates = extractTemplates(rules);
    const methodology = extractMethodology(templates, rules);

    // 'lines' appears in both templates → weight 1.0
    // 'is_bot' appears in only one template → weight 0.5
    const linesDim = methodology.dimensions.find(d => d.name === 'lines');
    const botDim = methodology.dimensions.find(d => d.name === 'is_bot');
    assert.ok(linesDim);
    assert.ok(botDim);
    assert.ok(linesDim!.weight >= botDim!.weight);
  });

  it('extracts principles grouped by action', () => {
    const rules: Rule[] = [
      makeRule({ id: 'r1', action: 'skip' }),
      makeRule({ id: 'r2', action: 'skip' }),
      makeRule({ id: 'r3', action: 'wake',
        match: { type: 'message', context: { idle_seconds: { lte: 300 }, changed: false } } }),
      makeRule({ id: 'r4', action: 'wake',
        match: { type: 'message', context: { idle_seconds: { lte: 300 }, changed: false } } }),
    ];
    const templates = extractTemplates(rules);
    const methodology = extractMethodology(templates, rules);

    assert.ok(methodology.principles.length >= 2);
    const actions = methodology.principles.map(p => p.then);
    assert.ok(actions.includes('skip'));
    assert.ok(actions.includes('wake'));
  });

  it('builds a decision matrix', () => {
    const rules: Rule[] = [
      makeRule({ id: 'r1', match: { type: 'alert', context: { is_bot: true, lines: { lte: 50 } } } }),
      makeRule({ id: 'r2', match: { type: 'alert', context: { is_bot: true, lines: { lte: 100 } } } }),
    ];
    const templates = extractTemplates(rules);
    const methodology = extractMethodology(templates, rules);

    // At least one matrix cell
    assert.ok(methodology.matrix.length > 0);
    assert.ok(methodology.matrix[0].action);
    assert.ok(typeof methodology.matrix[0].confidence === 'number');
    assert.ok(typeof methodology.matrix[0].support === 'number');
  });

  it('reports correct stats', () => {
    const rules: Rule[] = [
      makeRule({ id: 'r1', hitCount: 10 }),
      makeRule({ id: 'r2', hitCount: 20 }),
      makeRule({ id: 'r3', hitCount: 30 }),
      makeRule({ id: 'r4', hitCount: 40 }),
    ];
    const templates = extractTemplates(rules);
    const methodology = extractMethodology(templates, rules);

    assert.equal(methodology.ruleCount, 4);
    assert.equal(methodology.totalHits, 100);
  });
});

describe('formatMethodology', () => {
  it('formats methodology as readable text', () => {
    const rules: Rule[] = [
      makeRule({ id: 'r1', match: { type: 'alert', context: { is_bot: true } } }),
      makeRule({ id: 'r2', match: { type: 'alert', context: { is_bot: true } } }),
    ];
    const templates = extractTemplates(rules);
    const methodology = extractMethodology(templates, rules);
    const text = formatMethodology(methodology);

    assert.ok(text.includes('Decision Methodology'));
    assert.ok(text.includes('Dimensions'));
    assert.ok(text.includes('Principles'));
  });

  it('formats empty methodology gracefully', () => {
    const methodology = extractMethodology([], []);
    const text = formatMethodology(methodology);
    assert.ok(text.includes('Decision Methodology'));
    assert.ok(text.includes('0 rules'));
  });
});

describe('full three-layer pipeline', () => {
  it('runs Layer 1 → 2 → 3 end-to-end', () => {
    // Simulate a production scenario:
    // - 3 types of events, each with consistent LLM decisions → rules
    // - Rules group into templates
    // - Templates produce methodology

    const rules: Rule[] = [
      // Template 1: bot PRs → skip (3 rules)
      makeRule({ id: 'r1', action: 'skip', hitCount: 50,
        match: { type: 'pr', source: 'github', context: { is_bot: true, lines: { lte: 50 } } } }),
      makeRule({ id: 'r2', action: 'skip', hitCount: 30,
        match: { type: 'pr', source: 'github', context: { is_bot: true, lines: { lte: 100 } } } }),
      makeRule({ id: 'r3', action: 'skip', hitCount: 20,
        match: { type: 'pr', source: 'github', context: { is_bot: true, lines: { lte: 200 } } } }),

      // Template 2: human PRs → wake (2 rules)
      makeRule({ id: 'r4', action: 'wake', hitCount: 40,
        match: { type: 'pr', source: 'github', context: { is_bot: false, lines: { lte: 500 } } } }),
      makeRule({ id: 'r5', action: 'wake', hitCount: 25,
        match: { type: 'pr', source: 'github', context: { is_bot: false, lines: { lte: 1000 } } } }),

      // Template 3: alerts → quick (2 rules)
      makeRule({ id: 'r6', action: 'quick', hitCount: 60,
        match: { type: 'alert', source: 'monitoring', context: { severity: 'low', auto_resolve: true } } }),
      makeRule({ id: 'r7', action: 'quick', hitCount: 45,
        match: { type: 'alert', source: 'monitoring', context: { severity: 'low', auto_resolve: true } } }),
    ];

    // Layer 2: Extract templates
    const templates = extractTemplates(rules);
    assert.ok(templates.length >= 2, `Expected ≥2 templates, got ${templates.length}`);

    // Verify template properties
    for (const tmpl of templates) {
      assert.ok(tmpl.id.startsWith('tmpl_'));
      assert.ok(tmpl.name.length > 0);
      assert.ok(tmpl.ruleIds.length >= 2);
      assert.ok(tmpl.totalHits > 0);
    }

    // Layer 3: Extract methodology
    const methodology = extractMethodology(templates, rules);
    assert.ok(methodology.dimensions.length > 0, 'Should have dimensions');
    assert.ok(methodology.principles.length > 0, 'Should have principles');
    assert.equal(methodology.ruleCount, 7);
    assert.equal(methodology.totalHits, 270);

    // Verify the methodology is meaningful
    const dimNames = methodology.dimensions.map(d => d.name);
    // is_bot and lines appear in multiple templates → should be dimensions
    // (the exact set depends on grouping)
    assert.ok(methodology.dimensions.every(d => d.weight > 0));
    assert.ok(methodology.principles.every(p => p.confidence > 0));

    // Format should produce readable output
    const text = formatMethodology(methodology);
    assert.ok(text.length > 100, 'Methodology text should be substantial');
  });
});
