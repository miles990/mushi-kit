import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { matchRule, findMatchingRule, loadRules, saveRules, generateRuleId } from '../src/rules.ts';
import { writeFileSync, unlinkSync, existsSync } from 'node:fs';
import type { Rule, TriageEvent } from '../src/types.ts';

describe('matchRule', () => {
  it('matches exact event type', () => {
    const event: TriageEvent = { type: 'timer' };
    assert.ok(matchRule(event, { type: 'timer' }));
    assert.ok(!matchRule(event, { type: 'message' }));
  });

  it('matches regex event type', () => {
    const event: TriageEvent = { type: 'heartbeat' };
    assert.ok(matchRule(event, { type: '/heart.*/' }));
    assert.ok(!matchRule(event, { type: '/^msg/' }));
  });

  it('matches exact source', () => {
    const event: TriageEvent = { type: 'timer', source: 'cron' };
    assert.ok(matchRule(event, { source: 'cron' }));
    assert.ok(!matchRule(event, { source: 'manual' }));
  });

  it('fails source match when event has no source', () => {
    const event: TriageEvent = { type: 'timer' };
    assert.ok(!matchRule(event, { source: 'cron' }));
  });

  it('matches boolean context', () => {
    const event: TriageEvent = { type: 'timer', context: { changed: false } };
    assert.ok(matchRule(event, { context: { changed: false } }));
    assert.ok(!matchRule(event, { context: { changed: true } }));
  });

  it('matches numeric context with range', () => {
    const event: TriageEvent = { type: 'timer', context: { idle_seconds: 30 } };
    assert.ok(matchRule(event, { context: { idle_seconds: { lte: 60 } } }));
    assert.ok(!matchRule(event, { context: { idle_seconds: { gt: 60 } } }));
  });

  it('matches string context with exact value', () => {
    const event: TriageEvent = { type: 'message', context: { channel: 'general' } };
    assert.ok(matchRule(event, { context: { channel: 'general' } }));
    assert.ok(!matchRule(event, { context: { channel: 'random' } }));
  });

  it('matches regex pattern in context', () => {
    const event: TriageEvent = { type: 'message', context: { text: 'hello world' } };
    assert.ok(matchRule(event, { context: { text: { pattern: 'hello' } } }));
    assert.ok(!matchRule(event, { context: { text: { pattern: '^goodbye' } } }));
  });

  it('matches with no conditions (matches everything)', () => {
    const event: TriageEvent = { type: 'timer', source: 'cron', context: { x: 1 } };
    assert.ok(matchRule(event, {}));
  });

  it('matches combined type + source + context', () => {
    const event: TriageEvent = { type: 'timer', source: 'heartbeat', context: { idle: 120, changed: false } };
    assert.ok(matchRule(event, {
      type: 'timer',
      source: 'heartbeat',
      context: { idle: { lte: 300 }, changed: false },
    }));
  });
});

describe('findMatchingRule', () => {
  const rules: Rule[] = [
    { id: 'r1', match: { type: 'timer', context: { changed: false } }, action: 'skip', reason: 'no changes', createdAt: '2026-01-01', hitCount: 0 },
    { id: 'r2', match: { type: 'message' }, action: 'wake', reason: 'message received', createdAt: '2026-01-01', hitCount: 0 },
  ];

  it('returns first matching rule', () => {
    const result = findMatchingRule({ type: 'timer', context: { changed: false } }, rules);
    assert.equal(result?.id, 'r1');
  });

  it('returns null when no rule matches', () => {
    const result = findMatchingRule({ type: 'alert' }, rules);
    assert.equal(result, null);
  });
});

describe('loadRules / saveRules', () => {
  const testPath = '/tmp/myelin-test-rules.json';

  it('returns empty array for non-existent file', () => {
    const rules = loadRules('/tmp/nonexistent-myelin-rules-xyz.json');
    assert.deepEqual(rules, []);
  });

  it('round-trips rules through save and load', () => {
    const rules: Rule[] = [
      { id: 'r1', match: { type: 'timer' }, action: 'skip', reason: 'test', createdAt: '2026-01-01', hitCount: 5 },
    ];
    saveRules(testPath, rules);
    const loaded = loadRules(testPath);
    assert.deepEqual(loaded, rules);
    if (existsSync(testPath)) unlinkSync(testPath);
  });

  it('returns empty array for corrupt file', () => {
    writeFileSync(testPath, 'not json{{{', 'utf-8');
    const rules = loadRules(testPath);
    assert.deepEqual(rules, []);
    if (existsSync(testPath)) unlinkSync(testPath);
  });
});

describe('generateRuleId', () => {
  it('generates unique IDs', () => {
    const a = generateRuleId();
    const b = generateRuleId();
    assert.ok(a.startsWith('rule_'));
    assert.notEqual(a, b);
  });
});
