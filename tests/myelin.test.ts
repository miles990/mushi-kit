import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, unlinkSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { createMyelin } from '../src/index.ts';
import { matchRule } from '../src/rules.ts';
import { findCandidates } from '../src/crystallizer.ts';
import type { TriageEvent, DecisionLog, Action, RuleMatch } from '../src/types.ts';

const TEST_DIR = join(import.meta.dirname, '.tmp-test');
const RULES_PATH = join(TEST_DIR, 'rules.json');
const LOG_PATH = join(TEST_DIR, 'decisions.jsonl');

function cleanup() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
}

describe('Rule matching', () => {
  it('matches exact event type', () => {
    const event: TriageEvent = { type: 'alert' };
    const match: RuleMatch = { type: 'alert' };
    assert.equal(matchRule(event, match), true);
  });

  it('rejects mismatched event type', () => {
    const event: TriageEvent = { type: 'timer' };
    const match: RuleMatch = { type: 'alert' };
    assert.equal(matchRule(event, match), false);
  });

  it('matches regex event type', () => {
    const event: TriageEvent = { type: 'scheduled' };
    const match: RuleMatch = { type: '/schedul/' };
    assert.equal(matchRule(event, match), true);
  });

  it('matches source', () => {
    const event: TriageEvent = { type: 'timer', source: 'heartbeat' };
    const match: RuleMatch = { type: 'timer', source: 'heartbeat' };
    assert.equal(matchRule(event, match), true);
  });

  it('matches numeric range context', () => {
    const event: TriageEvent = { type: 'timer', context: { idle_seconds: 100 } };
    const match: RuleMatch = { type: 'timer', context: { idle_seconds: { lte: 300 } } };
    assert.equal(matchRule(event, match), true);
  });

  it('rejects out-of-range numeric context', () => {
    const event: TriageEvent = { type: 'timer', context: { idle_seconds: 500 } };
    const match: RuleMatch = { type: 'timer', context: { idle_seconds: { lte: 300 } } };
    assert.equal(matchRule(event, match), false);
  });

  it('matches boolean context', () => {
    const event: TriageEvent = { type: 'timer', context: { inbox_empty: true } };
    const match: RuleMatch = { type: 'timer', context: { inbox_empty: true } };
    assert.equal(matchRule(event, match), true);
  });

  it('matches empty match (matches everything)', () => {
    const event: TriageEvent = { type: 'custom', source: 'anything', context: { foo: 'bar' } };
    const match: RuleMatch = {};
    assert.equal(matchRule(event, match), true);
  });

  it('matches regex source pattern', () => {
    const event: TriageEvent = { type: 'scheduled', source: 'heartbeat-check' };
    const match: RuleMatch = { source: '/heartbeat/' };
    assert.equal(matchRule(event, match), true);
  });
});

describe('createMyelin', () => {
  beforeEach(() => {
    cleanup();
    mkdirSync(TEST_DIR, { recursive: true });
  });
  afterEach(cleanup);

  it('returns LLM decision when no rules match', async () => {
    const myelin = createMyelin({
      llm: async () => ({ action: 'wake' as Action, reason: 'needs attention' }),
      rulesPath: RULES_PATH,
      logPath: LOG_PATH,
    });

    const result = await myelin.triage({ type: 'message', context: { message_text: 'hello' } });
    assert.equal(result.action, 'wake');
    assert.equal(result.method, 'llm');
    assert.ok(result.reason.includes('needs attention'));
  });

  it('returns rule decision when a rule matches', async () => {
    const myelin = createMyelin({
      llm: async () => { throw new Error('should not be called'); },
      rulesPath: RULES_PATH,
      logPath: LOG_PATH,
    });

    // Add a rule
    myelin.addRule({
      match: { type: 'alert' },
      action: 'wake',
      reason: 'alerts always wake',
    });

    const result = await myelin.triage({ type: 'alert' });
    assert.equal(result.action, 'wake');
    assert.equal(result.method, 'rule');
    assert.equal(result.latencyMs, 0);
  });

  it('fails open on LLM error', async () => {
    const myelin = createMyelin({
      llm: async () => { throw new Error('LLM is down'); },
      rulesPath: RULES_PATH,
      logPath: LOG_PATH,
      failOpen: true,
      failOpenAction: 'wake',
    });

    const result = await myelin.triage({ type: 'timer' });
    assert.equal(result.action, 'wake');
    assert.equal(result.method, 'error');
    assert.ok(result.reason.includes('LLM is down'));
  });

  it('throws on LLM error when failOpen is false', async () => {
    const myelin = createMyelin({
      llm: async () => { throw new Error('LLM is down'); },
      rulesPath: RULES_PATH,
      logPath: LOG_PATH,
      failOpen: false,
    });

    await assert.rejects(
      () => myelin.triage({ type: 'timer' }),
      { message: 'LLM is down' },
    );
  });

  it('tracks stats correctly', async () => {
    let callCount = 0;
    const myelin = createMyelin({
      llm: async () => { callCount++; return { action: 'skip' as Action, reason: 'quiet' }; },
      rulesPath: RULES_PATH,
      logPath: LOG_PATH,
    });

    // Add a rule
    myelin.addRule({
      match: { type: 'alert' },
      action: 'wake',
      reason: 'alerts always wake',
    });

    // 2 rule hits + 3 LLM calls
    await myelin.triage({ type: 'alert' });
    await myelin.triage({ type: 'alert' });
    await myelin.triage({ type: 'timer' });
    await myelin.triage({ type: 'timer' });
    await myelin.triage({ type: 'timer' });

    const s = myelin.stats();
    assert.equal(s.totalDecisions, 5);
    assert.equal(s.ruleDecisions, 2);
    assert.equal(s.llmDecisions, 3);
    assert.equal(s.ruleCoverage, 40);
    assert.equal(s.ruleCount, 1);
    assert.equal(callCount, 3); // LLM only called for non-rule events
  });

  it('adds and removes rules', async () => {
    const myelin = createMyelin({
      llm: async () => ({ action: 'skip' as Action, reason: 'default' }),
      rulesPath: RULES_PATH,
      logPath: LOG_PATH,
    });

    const rule = myelin.addRule({
      match: { type: 'timer', context: { idle_seconds: { lte: 300 } } },
      action: 'skip',
      reason: 'recently active',
    });

    assert.equal(myelin.getRules().length, 1);
    assert.ok(rule.id);
    assert.ok(rule.createdAt);

    const removed = myelin.removeRule(rule.id);
    assert.equal(removed, true);
    assert.equal(myelin.getRules().length, 0);
  });

  it('persists rules across instances', async () => {
    // Instance 1: add rules
    const m1 = createMyelin({
      llm: async () => ({ action: 'skip' as Action, reason: 'default' }),
      rulesPath: RULES_PATH,
      logPath: LOG_PATH,
    });
    m1.addRule({ match: { type: 'alert' }, action: 'wake', reason: 'test' });

    // Instance 2: should see the rules
    const m2 = createMyelin({
      llm: async () => { throw new Error('should not be called'); },
      rulesPath: RULES_PATH,
      logPath: LOG_PATH,
    });

    assert.equal(m2.getRules().length, 1);
    const result = await m2.triage({ type: 'alert' });
    assert.equal(result.action, 'wake');
    assert.equal(result.method, 'rule');
  });
});

describe('Crystallizer', () => {
  it('finds stable patterns', () => {
    // Generate 15 consistent decisions
    const logs: DecisionLog[] = [];
    for (let i = 0; i < 15; i++) {
      logs.push({
        ts: new Date(Date.now() - i * 60000).toISOString(),
        event: { type: 'timer', context: { idle_seconds: 100 + i * 10 } },
        action: 'skip',
        reason: 'recently active',
        method: 'llm',
        latencyMs: 800,
      });
    }

    const candidates = findCandidates(logs, { minOccurrences: 10, minConsistency: 0.95 });
    assert.ok(candidates.length > 0);
    assert.equal(candidates[0].suggestedAction, 'skip');
    assert.equal(candidates[0].occurrences, 15);
    assert.equal(candidates[0].consistency, 1.0);
  });

  it('rejects inconsistent patterns', () => {
    const logs: DecisionLog[] = [];
    for (let i = 0; i < 15; i++) {
      logs.push({
        ts: new Date(Date.now() - i * 60000).toISOString(),
        event: { type: 'timer', context: { idle_seconds: 100 } },
        action: i % 2 === 0 ? 'skip' : 'wake',
        reason: 'mixed',
        method: 'llm',
        latencyMs: 800,
      });
    }

    const candidates = findCandidates(logs, { minOccurrences: 10, minConsistency: 0.95 });
    assert.equal(candidates.length, 0); // 50% consistency < 95% threshold
  });

  it('ignores rule decisions', () => {
    const logs: DecisionLog[] = [];
    for (let i = 0; i < 20; i++) {
      logs.push({
        ts: new Date().toISOString(),
        event: { type: 'alert' },
        action: 'wake',
        reason: 'rule',
        method: 'rule', // Already a rule — should not be a candidate
        latencyMs: 0,
      });
    }

    const candidates = findCandidates(logs, { minOccurrences: 10, minConsistency: 0.95 });
    assert.equal(candidates.length, 0);
  });

  it('requires minimum occurrences', () => {
    const logs: DecisionLog[] = [];
    for (let i = 0; i < 5; i++) {
      logs.push({
        ts: new Date().toISOString(),
        event: { type: 'timer', context: { idle_seconds: 100 } },
        action: 'skip',
        reason: 'quiet',
        method: 'llm',
        latencyMs: 800,
      });
    }

    const candidates = findCandidates(logs, { minOccurrences: 10, minConsistency: 0.95 });
    assert.equal(candidates.length, 0); // Only 5 occurrences < 10 threshold
  });
});

describe('Full crystallization flow', () => {
  beforeEach(() => {
    cleanup();
    mkdirSync(TEST_DIR, { recursive: true });
  });
  afterEach(cleanup);

  it('end-to-end: LLM decisions → candidates → crystallized rules', async () => {
    let llmCallCount = 0;
    const myelin = createMyelin({
      llm: async (event) => {
        llmCallCount++;
        const idle = (event.context?.idle_seconds as number) ?? Infinity;
        if (idle < 300) return { action: 'skip' as Action, reason: 'recently active' };
        return { action: 'wake' as Action, reason: 'idle too long' };
      },
      rulesPath: RULES_PATH,
      logPath: LOG_PATH,
      crystallize: { minOccurrences: 5, minConsistency: 0.9 },
    });

    // Phase 1: Train with LLM decisions
    for (let i = 0; i < 10; i++) {
      await myelin.triage({ type: 'timer', context: { idle_seconds: 100 + i * 10 } });
    }
    assert.equal(llmCallCount, 10);

    // Phase 2: Find candidates
    const candidates = myelin.getCandidates({ minOccurrences: 5, minConsistency: 0.9 });
    assert.ok(candidates.length > 0);
    assert.equal(candidates[0].suggestedAction, 'skip'); // All were < 300s

    // Phase 3: Crystallize
    const rule = myelin.crystallize(candidates[0]);
    assert.ok(rule.id);
    assert.equal(rule.action, 'skip');

    // Phase 4: Verify rules now handle the pattern
    llmCallCount = 0;
    const result = await myelin.triage({ type: 'timer', context: { idle_seconds: 150 } });
    assert.equal(result.method, 'rule');
    assert.equal(result.action, 'skip');
    assert.equal(llmCallCount, 0); // LLM not called!
  });
});
