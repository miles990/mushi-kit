import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMyelinate } from '../src/index.ts';
import { unlinkSync, existsSync } from 'node:fs';
import type { Action } from '../src/types.ts';

const TEST_RULES = '/tmp/myelinate-integration-rules.json';
const TEST_LOG = '/tmp/myelinate-integration-decisions.jsonl';

function cleanup() {
  for (const f of [TEST_RULES, TEST_LOG]) {
    if (existsSync(f)) unlinkSync(f);
  }
}

describe('createMyelinate integration', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('calls LLM when no rules exist', async () => {
    let llmCalled = false;
    const myelinate = createMyelinate({
      llm: async () => {
        llmCalled = true;
        return { action: 'wake' as Action, reason: 'needs attention' };
      },
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
    });

    const result = await myelinate.triage({ type: 'message' });
    assert.ok(llmCalled);
    assert.equal(result.action, 'wake');
    assert.equal(result.method, 'llm');
  });

  it('uses rules instead of LLM when rule matches', async () => {
    let llmCalled = false;
    const myelinate = createMyelinate({
      llm: async () => {
        llmCalled = true;
        return { action: 'wake' as Action, reason: 'llm decided' };
      },
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
    });

    myelinate.addRule({ match: { type: 'timer' }, action: 'skip', reason: 'manual rule' });

    const result = await myelinate.triage({ type: 'timer' });
    assert.ok(!llmCalled);
    assert.equal(result.action, 'skip');
    assert.equal(result.method, 'rule');
    assert.ok(result.latencyMs <= 5);
  });

  it('fail-open when LLM throws', async () => {
    const myelinate = createMyelinate({
      llm: async () => { throw new Error('API down'); },
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
      failOpen: true,
      failOpenAction: 'wake',
    });

    const result = await myelinate.triage({ type: 'alert' });
    assert.equal(result.action, 'wake');
    assert.equal(result.method, 'error');
    assert.ok(result.reason.includes('API down'));
  });

  it('throws when failOpen is false', async () => {
    const myelinate = createMyelinate({
      llm: async () => { throw new Error('API down'); },
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
      failOpen: false,
    });

    await assert.rejects(() => myelinate.triage({ type: 'alert' }), { message: 'API down' });
  });

  it('tracks stats correctly', async () => {
    const myelinate = createMyelinate({
      llm: async () => ({ action: 'wake' as Action, reason: 'llm' }),
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
    });

    myelinate.addRule({ match: { type: 'timer' }, action: 'skip', reason: 'rule' });

    await myelinate.triage({ type: 'timer' });   // rule
    await myelinate.triage({ type: 'timer' });   // rule
    await myelinate.triage({ type: 'message' }); // llm

    const s = myelinate.stats();
    assert.equal(s.totalDecisions, 3);
    assert.equal(s.ruleDecisions, 2);
    assert.equal(s.llmDecisions, 1);
    assert.ok(s.ruleCoverage > 60);
  });

  it('full crystallization lifecycle', async () => {
    const myelinate = createMyelinate({
      llm: async (event) => {
        if (event.type === 'timer' && event.context?.changed === false) {
          return { action: 'skip' as Action, reason: 'idle, no changes' };
        }
        return { action: 'wake' as Action, reason: 'needs attention' };
      },
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
      crystallize: { minOccurrences: 5, minConsistency: 0.95 },
    });

    // Generate 10 identical LLM decisions
    for (let i = 0; i < 10; i++) {
      await myelinate.triage({ type: 'timer', context: { changed: false, idle_seconds: 30 } });
    }

    assert.equal(myelinate.stats().llmDecisions, 10);
    assert.equal(myelinate.stats().ruleDecisions, 0);

    // Find candidates
    const candidates = myelinate.getCandidates({ minOccurrences: 5, minConsistency: 0.95 });
    assert.ok(candidates.length >= 1);
    assert.equal(candidates[0].suggestedAction, 'skip');
    assert.equal(candidates[0].consistency, 1.0);

    // Crystallize
    const rule = myelinate.crystallize(candidates[0]);
    assert.ok(rule.id.startsWith('rule_'));
    assert.equal(rule.action, 'skip');
    assert.equal(myelinate.getRules().length, 1);

    // Now the same event should hit the rule, not the LLM
    const result = await myelinate.triage({ type: 'timer', context: { changed: false, idle_seconds: 30 } });
    assert.equal(result.method, 'rule');
    assert.equal(result.action, 'skip');
    assert.equal(myelinate.stats().ruleDecisions, 1);
  });

  it('addRule and removeRule work', () => {
    const myelinate = createMyelinate({
      llm: async () => ({ action: 'wake' as Action, reason: 'test' }),
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
    });

    const rule = myelinate.addRule({ match: { type: 'x' }, action: 'skip', reason: 'test' });
    assert.equal(myelinate.getRules().length, 1);

    const removed = myelinate.removeRule(rule.id);
    assert.ok(removed);
    assert.equal(myelinate.getRules().length, 0);

    assert.ok(!myelinate.removeRule('nonexistent'));
  });

  it('logs decisions to JSONL', async () => {
    const myelinate = createMyelinate({
      llm: async () => ({ action: 'wake' as Action, reason: 'test' }),
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
      autoLog: true,
    });

    await myelinate.triage({ type: 'message' });
    await myelinate.triage({ type: 'alert' });

    // Read log file
    const { readFileSync } = await import('node:fs');
    const lines = readFileSync(TEST_LOG, 'utf-8').trim().split('\n');
    assert.equal(lines.length, 2);
    const entry = JSON.parse(lines[0]);
    assert.equal(entry.action, 'wake');
    assert.equal(entry.method, 'llm');
    assert.ok(entry.ts);
  });
});

describe('Custom actions (generics)', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('supports custom action types via process()', async () => {
    type ModelAction = 'gpt-4' | 'haiku' | 'local';
    const myelinate = createMyelinate<ModelAction>({
      llm: async (event) => {
        const complexity = event.context?.complexity as string;
        if (complexity === 'high') return { action: 'gpt-4', reason: 'complex query' };
        if (complexity === 'low') return { action: 'local', reason: 'simple query' };
        return { action: 'haiku', reason: 'default' };
      },
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
    });

    const result = await myelinate.process({ type: 'custom', context: { complexity: 'high' } });
    assert.equal(result.action, 'gpt-4');
    assert.equal(result.method, 'llm');
  });

  it('process() and triage() return the same result', async () => {
    const myelinate = createMyelinate({
      llm: async () => ({ action: 'skip' as Action, reason: 'test' }),
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
      autoLog: false,
    });

    const r1 = await myelinate.process({ type: 'timer' });
    const r2 = await myelinate.triage({ type: 'timer' });
    assert.equal(r1.action, r2.action);
    assert.equal(r1.method, r2.method);
  });

  it('crystallizes custom actions', async () => {
    type Priority = 'p0' | 'p1' | 'p2';
    const myelinate = createMyelinate<Priority>({
      llm: async () => ({ action: 'p2', reason: 'low priority' }),
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
      crystallize: { minOccurrences: 5, minConsistency: 0.95 },
    });

    // Generate consistent decisions
    for (let i = 0; i < 10; i++) {
      await myelinate.process({ type: 'timer', context: { idle: true } });
    }

    const candidates = myelinate.getCandidates({ minOccurrences: 5, minConsistency: 0.95 });
    assert.ok(candidates.length > 0);
    assert.equal(candidates[0].suggestedAction, 'p2');

    const rule = myelinate.crystallize(candidates[0]);
    assert.equal(rule.action, 'p2');

    // Now should hit rule
    const result = await myelinate.process({ type: 'timer', context: { idle: true } });
    assert.equal(result.method, 'rule');
    assert.equal(result.action, 'p2');
  });
});
