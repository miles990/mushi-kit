import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { findCandidates, candidateToRule } from '../src/crystallizer.ts';
import type { DecisionLog } from '../src/types.ts';

function makeLog(overrides: Partial<DecisionLog> = {}): DecisionLog {
  return {
    ts: new Date().toISOString(),
    event: { type: 'timer', context: { idle_seconds: 30, changed: false } },
    action: 'skip',
    reason: 'idle, no changes',
    method: 'llm',
    latencyMs: 500,
    ...overrides,
  };
}

describe('findCandidates', () => {
  it('returns empty for no logs', () => {
    const result = findCandidates([], { minOccurrences: 3, minConsistency: 0.9 });
    assert.deepEqual(result, []);
  });

  it('returns empty when below minOccurrences', () => {
    const logs = Array.from({ length: 4 }, () => makeLog());
    const result = findCandidates(logs, { minOccurrences: 5, minConsistency: 0.9 });
    assert.deepEqual(result, []);
  });

  it('finds a stable pattern', () => {
    const logs = Array.from({ length: 15 }, () => makeLog());
    const result = findCandidates(logs, { minOccurrences: 10, minConsistency: 0.95 });
    assert.equal(result.length, 1);
    assert.equal(result[0].suggestedAction, 'skip');
    assert.equal(result[0].occurrences, 15);
    assert.equal(result[0].consistency, 1.0);
  });

  it('rejects inconsistent patterns', () => {
    const logs = [
      ...Array.from({ length: 7 }, () => makeLog({ action: 'skip' })),
      ...Array.from({ length: 5 }, () => makeLog({ action: 'wake' })),
    ];
    const result = findCandidates(logs, { minOccurrences: 10, minConsistency: 0.95 });
    assert.deepEqual(result, []);
  });

  it('ignores rule-based decisions', () => {
    const logs = Array.from({ length: 20 }, () => makeLog({ method: 'rule' }));
    const result = findCandidates(logs, { minOccurrences: 5, minConsistency: 0.9 });
    assert.deepEqual(result, []);
  });

  it('finds multiple distinct patterns', () => {
    const timerLogs = Array.from({ length: 10 }, () => makeLog());
    const msgLogs = Array.from({ length: 10 }, () => makeLog({
      event: { type: 'message', context: { priority: false } },
      action: 'wake',
      reason: 'message needs attention',
    }));
    const result = findCandidates([...timerLogs, ...msgLogs], { minOccurrences: 10, minConsistency: 0.95 });
    assert.equal(result.length, 2);
  });

  it('captures string context values in crystallized rules', () => {
    const logs = Array.from({ length: 10 }, () => makeLog({
      event: { type: 'alert', source: 'dependabot', context: { repo: 'my-lib', severity: 'low' } },
      action: 'skip',
      reason: 'dependabot low severity',
    }));
    const result = findCandidates(logs, { minOccurrences: 5, minConsistency: 0.9 });
    assert.equal(result.length, 1);
    assert.equal(result[0].match.type, 'alert');
    assert.equal(result[0].match.source, 'dependabot');
    assert.ok(result[0].match.context, 'match should have context conditions');
    assert.equal(result[0].match.context!.repo, 'my-lib');
    assert.equal(result[0].match.context!.severity, 'low');
  });

  it('skips string context when values vary', () => {
    const logs = Array.from({ length: 10 }, (_, i) => makeLog({
      event: { type: 'alert', context: { repo: `repo-${i % 3}`, changed: false } },
      action: 'skip',
    }));
    const result = findCandidates(logs, { minOccurrences: 5, minConsistency: 0.9 });
    assert.equal(result.length, 1);
    // 'repo' varies across events, so should NOT be in context conditions
    const ctx = result[0].match.context;
    assert.ok(ctx, 'should have context for boolean');
    assert.equal(ctx!.changed, false);
    assert.equal(ctx!.repo, undefined, 'varying string should not be captured');
  });

  it('sorts by occurrences descending', () => {
    const manyLogs = Array.from({ length: 20 }, () => makeLog());
    const fewerLogs = Array.from({ length: 12 }, () => makeLog({
      event: { type: 'alert', context: { severity: true } },
      action: 'wake',
    }));
    const result = findCandidates([...manyLogs, ...fewerLogs], { minOccurrences: 10, minConsistency: 0.95 });
    assert.ok(result[0].occurrences >= result[1].occurrences);
  });
});

describe('candidateToRule', () => {
  it('converts candidate to rule with correct fields', () => {
    const candidate = findCandidates(
      Array.from({ length: 10 }, () => makeLog()),
      { minOccurrences: 10, minConsistency: 0.95 },
    )[0];
    const rule = candidateToRule(candidate);
    assert.ok(rule.id.startsWith('rule_'));
    assert.equal(rule.action, 'skip');
    assert.ok(rule.reason.includes('crystallized'));
    assert.ok(rule.createdAt);
    assert.equal(rule.hitCount, 0);
    assert.deepEqual(rule.match.type, 'timer');
  });
});
