import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMushi } from '../src/index.ts';
import { unlinkSync, existsSync } from 'node:fs';
import type { Action } from '../src/types.ts';

const TEST_RULES = '/tmp/mushi-kit-integration-rules.json';
const TEST_LOG = '/tmp/mushi-kit-integration-decisions.jsonl';

function cleanup() {
  for (const f of [TEST_RULES, TEST_LOG]) {
    if (existsSync(f)) unlinkSync(f);
  }
}

describe('createMushi integration', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('calls LLM when no rules exist', async () => {
    let llmCalled = false;
    const mushi = createMushi({
      llm: async () => {
        llmCalled = true;
        return { action: 'wake' as Action, reason: 'needs attention' };
      },
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
    });

    const result = await mushi.triage({ type: 'message' });
    assert.ok(llmCalled);
    assert.equal(result.action, 'wake');
    assert.equal(result.method, 'llm');
  });

  it('uses rules instead of LLM when rule matches', async () => {
    let llmCalled = false;
    const mushi = createMushi({
      llm: async () => {
        llmCalled = true;
        return { action: 'wake' as Action, reason: 'llm decided' };
      },
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
    });

    mushi.addRule({ match: { type: 'timer' }, action: 'skip', reason: 'manual rule' });

    const result = await mushi.triage({ type: 'timer' });
    assert.ok(!llmCalled);
    assert.equal(result.action, 'skip');
    assert.equal(result.method, 'rule');
    assert.ok(result.latencyMs <= 5);
  });

  it('fail-open when LLM throws', async () => {
    const mushi = createMushi({
      llm: async () => { throw new Error('API down'); },
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
      failOpen: true,
      failOpenAction: 'wake',
    });

    const result = await mushi.triage({ type: 'alert' });
    assert.equal(result.action, 'wake');
    assert.equal(result.method, 'error');
    assert.ok(result.reason.includes('API down'));
  });

  it('throws when failOpen is false', async () => {
    const mushi = createMushi({
      llm: async () => { throw new Error('API down'); },
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
      failOpen: false,
    });

    await assert.rejects(() => mushi.triage({ type: 'alert' }), { message: 'API down' });
  });

  it('tracks stats correctly', async () => {
    const mushi = createMushi({
      llm: async () => ({ action: 'wake' as Action, reason: 'llm' }),
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
    });

    mushi.addRule({ match: { type: 'timer' }, action: 'skip', reason: 'rule' });

    await mushi.triage({ type: 'timer' });   // rule
    await mushi.triage({ type: 'timer' });   // rule
    await mushi.triage({ type: 'message' }); // llm

    const s = mushi.stats();
    assert.equal(s.totalDecisions, 3);
    assert.equal(s.ruleDecisions, 2);
    assert.equal(s.llmDecisions, 1);
    assert.ok(s.ruleCoverage > 60);
  });

  it('full crystallization lifecycle', async () => {
    const mushi = createMushi({
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
      await mushi.triage({ type: 'timer', context: { changed: false, idle_seconds: 30 } });
    }

    assert.equal(mushi.stats().llmDecisions, 10);
    assert.equal(mushi.stats().ruleDecisions, 0);

    // Find candidates
    const candidates = mushi.getCandidates({ minOccurrences: 5, minConsistency: 0.95 });
    assert.ok(candidates.length >= 1);
    assert.equal(candidates[0].suggestedAction, 'skip');
    assert.equal(candidates[0].consistency, 1.0);

    // Crystallize
    const rule = mushi.crystallize(candidates[0]);
    assert.ok(rule.id.startsWith('rule_'));
    assert.equal(rule.action, 'skip');
    assert.equal(mushi.getRules().length, 1);

    // Now the same event should hit the rule, not the LLM
    const result = await mushi.triage({ type: 'timer', context: { changed: false, idle_seconds: 30 } });
    assert.equal(result.method, 'rule');
    assert.equal(result.action, 'skip');
    assert.equal(mushi.stats().ruleDecisions, 1);
  });

  it('addRule and removeRule work', () => {
    const mushi = createMushi({
      llm: async () => ({ action: 'wake' as Action, reason: 'test' }),
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
    });

    const rule = mushi.addRule({ match: { type: 'x' }, action: 'skip', reason: 'test' });
    assert.equal(mushi.getRules().length, 1);

    const removed = mushi.removeRule(rule.id);
    assert.ok(removed);
    assert.equal(mushi.getRules().length, 0);

    assert.ok(!mushi.removeRule('nonexistent'));
  });

  it('logs decisions to JSONL', async () => {
    const mushi = createMushi({
      llm: async () => ({ action: 'wake' as Action, reason: 'test' }),
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
      autoLog: true,
    });

    await mushi.triage({ type: 'message' });
    await mushi.triage({ type: 'alert' });

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
