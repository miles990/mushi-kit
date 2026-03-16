/**
 * Tests for new myelin APIs:
 * - observe()
 * - triageSafe()
 * - heuristic in triage flow
 * - toPromptBlock()
 * - recordEpisode() / getEpisodes() / crystallizeEpisodes()
 * - maybeDistill()
 * - toSmallModelPrompt()
 * - Array condition matching
 * - Fleet, Stack, Singleton
 * - MyelinStats with heuristic/observe fields
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { createMyelin } from '../src/index.ts';
import { createFleet } from '../src/fleet.ts';
import { createStack } from '../src/stack.ts';
import { getOrCreate, getInstance, clearInstances, listInstances, removeInstance } from '../src/singleton.ts';
import { matchRule } from '../src/rules.ts';
import type { Action, TriageEvent, RuleMatch } from '../src/types.ts';

const TEST_DIR = join(import.meta.dirname, '.tmp-new-api');
let testCounter = 0;
function testPaths() {
  testCounter++;
  return {
    rules: join(TEST_DIR, `rules-${testCounter}.json`),
    log: join(TEST_DIR, `log-${testCounter}.jsonl`),
  };
}

function cleanup() {
  if (existsSync(TEST_DIR)) rmSync(TEST_DIR, { recursive: true });
}

beforeEach(() => {
  cleanup();
  mkdirSync(TEST_DIR, { recursive: true });
});

// ── observe() ───────────────────────────────────────────

describe('observe()', () => {
  it('records observation without triggering triage', () => {
    const { rules, log } = testPaths();
    let llmCalled = false;
    const myelin = createMyelin({
      llm: async () => { llmCalled = true; return { action: 'wake' as Action, reason: 'llm' }; },
      rulesPath: rules,
      logPath: log,
    });

    myelin.observe({ type: 'timer', context: { idle: 30 } });
    assert.equal(llmCalled, false, 'LLM should not be called for observe');
    assert.equal(myelin.stats().observeCount, 1);
  });

  it('increments observeCount on each call', () => {
    const { rules, log } = testPaths();
    const myelin = createMyelin({
      llm: async () => ({ action: 'skip' as Action, reason: 'x' }),
      rulesPath: rules,
      logPath: log,
    });

    myelin.observe({ type: 'a' });
    myelin.observe({ type: 'b' });
    myelin.observe({ type: 'c' });
    assert.equal(myelin.stats().observeCount, 3);
  });
});

// ── triageSafe() ────────────────────────────────────────

describe('triageSafe()', () => {
  it('returns result on success', async () => {
    const { rules, log } = testPaths();
    const myelin = createMyelin({
      llm: async () => ({ action: 'wake' as Action, reason: 'test' }),
      rulesPath: rules,
      logPath: log,
    });

    const result = await myelin.triageSafe({ type: 'message' });
    assert.equal(result.action, 'wake');
    assert.equal(result.method, 'llm');
  });

  it('never throws — returns fail-open result on error', async () => {
    const { rules, log } = testPaths();
    const myelin = createMyelin({
      llm: async () => { throw new Error('boom'); },
      rulesPath: rules,
      logPath: log,
      failOpen: false, // even with failOpen false, triageSafe catches
    });

    const result = await myelin.triageSafe({ type: 'message' });
    assert.equal(result.method, 'error');
    assert.equal(result.action, 'wake'); // default failOpenAction
  });
});

// ── heuristic in triage flow ────────────────────────────

describe('heuristic triage', () => {
  it('uses heuristic when no rule matches and heuristic returns result', async () => {
    const { rules, log } = testPaths();
    let llmCalled = false;
    const myelin = createMyelin({
      llm: async () => { llmCalled = true; return { action: 'wake' as Action, reason: 'llm' }; },
      heuristic: (event) => {
        if (event.type === 'timer') return { action: 'skip' as Action, reason: 'heuristic: timer' };
        return null;
      },
      rulesPath: rules,
      logPath: log,
    });

    const result = await myelin.triage({ type: 'timer' });
    assert.equal(result.action, 'skip');
    assert.equal(result.method, 'heuristic');
    assert.equal(llmCalled, false, 'LLM should not be called when heuristic matches');
  });

  it('falls through to LLM when heuristic returns null', async () => {
    const { rules, log } = testPaths();
    const myelin = createMyelin({
      llm: async () => ({ action: 'wake' as Action, reason: 'llm result' }),
      heuristic: () => null,
      rulesPath: rules,
      logPath: log,
    });

    const result = await myelin.triage({ type: 'message' });
    assert.equal(result.method, 'llm');
  });

  it('tracks heuristic stats', async () => {
    const { rules, log } = testPaths();
    const myelin = createMyelin({
      llm: async () => ({ action: 'wake' as Action, reason: 'llm' }),
      heuristic: () => ({ action: 'skip' as Action, reason: 'h' }),
      rulesPath: rules,
      logPath: log,
    });

    await myelin.triage({ type: 'timer' });
    await myelin.triage({ type: 'message' });
    const s = myelin.stats();
    assert.equal(s.heuristicDecisions, 2);
    assert.equal(s.llmDecisions, 0);
  });
});

// ── toPromptBlock() ─────────────────────────────────────

describe('toPromptBlock()', () => {
  it('returns XML format by default', () => {
    const { rules, log } = testPaths();
    const myelin = createMyelin({
      llm: async () => ({ action: 'skip' as Action, reason: 'x' }),
      rulesPath: rules,
      logPath: log,
    });

    myelin.addRule({ match: { type: 'timer' }, action: 'skip', reason: 'timer skip' });
    const block = myelin.toPromptBlock();
    assert.ok(block.includes('<crystallized-rules>'));
    assert.ok(block.includes('</crystallized-rules>'));
  });

  it('returns markdown format when requested', () => {
    const { rules, log } = testPaths();
    const myelin = createMyelin({
      llm: async () => ({ action: 'skip' as Action, reason: 'x' }),
      rulesPath: rules,
      logPath: log,
    });

    myelin.addRule({ match: { type: 'timer' }, action: 'skip', reason: 'timer skip' });
    const block = myelin.toPromptBlock({ format: 'markdown' });
    assert.ok(block.includes('## Crystallized Rules'));
    assert.ok(!block.includes('<crystallized-rules>'));
  });

  it('returns empty string when no rules exist', () => {
    const { rules, log } = testPaths();
    const myelin = createMyelin({
      llm: async () => ({ action: 'skip' as Action, reason: 'x' }),
      rulesPath: rules,
      logPath: log,
    });

    const block = myelin.toPromptBlock();
    assert.equal(block, '');
  });
});

// ── Episodes ────────────────────────────────────────────

describe('episodes', () => {
  it('recordEpisode stores and returns episode with ID', () => {
    const { rules, log } = testPaths();
    const myelin = createMyelin({
      llm: async () => ({ action: 'skip' as Action, reason: 'x' }),
      rulesPath: rules,
      logPath: log,
    });

    const ep = myelin.recordEpisode({
      steps: [
        { event: { type: 'timer' }, result: { action: 'skip', reason: 'r', method: 'rule', latencyMs: 0 }, timestamp: new Date().toISOString() },
      ],
      outcome: 'success',
      startedAt: new Date().toISOString(),
    });

    assert.ok(ep.id.startsWith('ep_'));
    assert.equal(ep.outcome, 'success');
  });

  it('getEpisodes returns all recorded episodes', () => {
    const { rules, log } = testPaths();
    const myelin = createMyelin({
      llm: async () => ({ action: 'skip' as Action, reason: 'x' }),
      rulesPath: rules,
      logPath: log,
    });

    myelin.recordEpisode({ steps: [], outcome: 'success', startedAt: new Date().toISOString() });
    myelin.recordEpisode({ steps: [], outcome: 'failure', startedAt: new Date().toISOString() });
    assert.equal(myelin.getEpisodes().length, 2);
  });

  it('crystallizeEpisodes extracts rules from episode patterns', () => {
    const { rules, log } = testPaths();
    const myelin = createMyelin({
      llm: async () => ({ action: 'skip' as Action, reason: 'x' }),
      rulesPath: rules,
      logPath: log,
    });

    // Record 4 episodes with the same action pattern
    for (let i = 0; i < 4; i++) {
      myelin.recordEpisode({
        steps: [
          { event: { type: 'timer' }, result: { action: 'skip', reason: 'r', method: 'rule', latencyMs: 0 }, timestamp: new Date().toISOString() },
          { event: { type: 'message' }, result: { action: 'wake', reason: 'r', method: 'llm', latencyMs: 5 }, timestamp: new Date().toISOString() },
        ],
        outcome: 'success',
        startedAt: new Date().toISOString(),
      });
    }

    const expRules = myelin.crystallizeEpisodes({ minEpisodes: 3, minSuccessRate: 0.5 });
    assert.ok(expRules.length > 0, 'Should extract at least one experience rule');
    assert.ok(expRules[0].successRate >= 0.5);
    assert.ok(expRules[0].episodeCount >= 3);
  });

  it('crystallizeEpisodes returns empty when not enough episodes', () => {
    const { rules, log } = testPaths();
    const myelin = createMyelin({
      llm: async () => ({ action: 'skip' as Action, reason: 'x' }),
      rulesPath: rules,
      logPath: log,
    });

    myelin.recordEpisode({ steps: [], outcome: 'success', startedAt: new Date().toISOString() });
    const expRules = myelin.crystallizeEpisodes({ minEpisodes: 5 });
    assert.equal(expRules.length, 0);
  });
});

// ── maybeDistill() ──────────────────────────────────────

describe('maybeDistill()', () => {
  it('returns null when not enough decisions accumulated', async () => {
    const { rules, log } = testPaths();
    const myelin = createMyelin({
      llm: async () => ({ action: 'skip' as Action, reason: 'x' }),
      rulesPath: rules,
      logPath: log,
    });

    await myelin.triage({ type: 'message' });
    const result = myelin.maybeDistill({ minNewDecisions: 100 });
    assert.equal(result, null);
  });

  it('distills when enough decisions accumulated', async () => {
    const { rules, log } = testPaths();
    const myelin = createMyelin({
      llm: async () => ({ action: 'skip' as Action, reason: 'x' }),
      rulesPath: rules,
      logPath: log,
    });

    // Make enough decisions
    for (let i = 0; i < 5; i++) {
      await myelin.triage({ type: 'message' });
    }

    const result = myelin.maybeDistill({ minNewDecisions: 3, minIntervalMs: 0 });
    assert.ok(result !== null, 'Should distill when enough decisions');
    assert.ok(Array.isArray(result!.rules));
    assert.ok(Array.isArray(result!.templates));
  });
});

// ── toSmallModelPrompt() ────────────────────────────────

describe('toSmallModelPrompt()', () => {
  it('returns empty string when no methodology', () => {
    const { rules, log } = testPaths();
    const myelin = createMyelin({
      llm: async () => ({ action: 'skip' as Action, reason: 'x' }),
      rulesPath: rules,
      logPath: log,
    });

    assert.equal(myelin.toSmallModelPrompt(), '');
  });

  it('returns concise format with rules', () => {
    const { rules, log } = testPaths();
    const myelin = createMyelin({
      llm: async () => ({ action: 'skip' as Action, reason: 'x' }),
      rulesPath: rules,
      logPath: log,
    });

    // Add enough similar rules to generate templates → methodology
    for (let i = 0; i < 5; i++) {
      myelin.addRule({ match: { type: 'timer', context: { idle: { lte: 60 * (i + 1) } } }, action: 'skip', reason: `skip timer ${i}` });
    }

    const prompt = myelin.toSmallModelPrompt();
    assert.ok(prompt.includes('RULES:') || prompt.includes('TOP PATTERNS:'));
  });
});

// ── Array condition matching ────────────────────────────

describe('array condition matching', () => {
  it('matches includes condition', () => {
    const event: TriageEvent = { type: 'test', context: { tags: ['urgent', 'bug'] } };
    const match: RuleMatch = { type: 'test', context: { tags: { includes: 'urgent' } } };
    assert.equal(matchRule(event, match), true);
  });

  it('rejects includes when element not present', () => {
    const event: TriageEvent = { type: 'test', context: { tags: ['feature'] } };
    const match: RuleMatch = { type: 'test', context: { tags: { includes: 'urgent' } } };
    assert.equal(matchRule(event, match), false);
  });

  it('matches includesAny condition', () => {
    const event: TriageEvent = { type: 'test', context: { tags: ['docs', 'minor'] } };
    const match: RuleMatch = { type: 'test', context: { tags: { includesAny: ['urgent', 'minor'] } } };
    assert.equal(matchRule(event, match), true);
  });

  it('rejects includesAny when no elements match', () => {
    const event: TriageEvent = { type: 'test', context: { tags: ['docs'] } };
    const match: RuleMatch = { type: 'test', context: { tags: { includesAny: ['urgent', 'minor'] } } };
    assert.equal(matchRule(event, match), false);
  });

  it('matches includesAll condition', () => {
    const event: TriageEvent = { type: 'test', context: { tags: ['urgent', 'bug', 'p0'] } };
    const match: RuleMatch = { type: 'test', context: { tags: { includesAll: ['urgent', 'bug'] } } };
    assert.equal(matchRule(event, match), true);
  });

  it('rejects includesAll when not all present', () => {
    const event: TriageEvent = { type: 'test', context: { tags: ['urgent'] } };
    const match: RuleMatch = { type: 'test', context: { tags: { includesAll: ['urgent', 'bug'] } } };
    assert.equal(matchRule(event, match), false);
  });

  it('rejects array conditions when value is not an array', () => {
    const event: TriageEvent = { type: 'test', context: { tags: 'not-array' } };
    const match: RuleMatch = { type: 'test', context: { tags: { includes: 'urgent' } } };
    assert.equal(matchRule(event, match), false);
  });
});

// ── Fleet ───────────────────────────────────────────────

describe('createFleet', () => {
  it('manages multiple instances', () => {
    const { rules: r1, log: l1 } = testPaths();
    const { rules: r2, log: l2 } = testPaths();

    const m1 = createMyelin({ llm: async () => ({ action: 'skip' as Action, reason: 'x' }), rulesPath: r1, logPath: l1 });
    const m2 = createMyelin({ llm: async () => ({ action: 'wake' as Action, reason: 'y' }), rulesPath: r2, logPath: l2 });

    const fleet = createFleet([
      { name: 'triage', instance: m1 },
      { name: 'routing', instance: m2 },
    ]);

    assert.deepEqual(fleet.names(), ['triage', 'routing']);
    assert.equal(fleet.get('triage'), m1);
    assert.equal(fleet.get('nonexistent'), undefined);
  });

  it('broadcasts observations to all members', () => {
    const { rules: r1, log: l1 } = testPaths();
    const { rules: r2, log: l2 } = testPaths();

    const m1 = createMyelin({ llm: async () => ({ action: 'skip' as Action, reason: 'x' }), rulesPath: r1, logPath: l1 });
    const m2 = createMyelin({ llm: async () => ({ action: 'wake' as Action, reason: 'y' }), rulesPath: r2, logPath: l2 });

    const fleet = createFleet([
      { name: 'a', instance: m1 },
      { name: 'b', instance: m2 },
    ]);

    fleet.observeAll({ type: 'test' });
    assert.equal(m1.stats().observeCount, 1);
    assert.equal(m2.stats().observeCount, 1);
  });

  it('returns fleet-wide stats', async () => {
    const { rules: r1, log: l1 } = testPaths();
    const { rules: r2, log: l2 } = testPaths();

    const m1 = createMyelin({ llm: async () => ({ action: 'skip' as Action, reason: 'x' }), rulesPath: r1, logPath: l1 });
    const m2 = createMyelin({ llm: async () => ({ action: 'wake' as Action, reason: 'y' }), rulesPath: r2, logPath: l2 });

    await m1.triage({ type: 'a' });
    await m2.triage({ type: 'b' });
    await m2.triage({ type: 'c' });

    const fleet = createFleet([
      { name: 'a', instance: m1 },
      { name: 'b', instance: m2 },
    ]);

    const s = fleet.stats();
    assert.equal(s.totalDecisions, 3);
    assert.equal(s.members.length, 2);
  });
});

// ── Stack ───────────────────────────────────────────────

describe('createStack', () => {
  it('chains layers for distillation', () => {
    const { rules: r1, log: l1 } = testPaths();
    const { rules: r2, log: l2 } = testPaths();

    const layer1 = createMyelin({ llm: async () => ({ action: 'skip' as Action, reason: 'x' }), rulesPath: r1, logPath: l1 });
    const layer2 = createMyelin({ llm: async () => ({ action: 'wake' as Action, reason: 'y' }), rulesPath: r2, logPath: l2 });

    const stack = createStack({ layers: [layer1, layer2] });

    assert.equal(stack.depth(), 2);
    assert.equal(stack.layer(0), layer1);
    assert.equal(stack.layer(1), layer2);
    assert.equal(stack.layer(5), undefined);
  });

  it('distill cascades through layers', () => {
    const { rules: r1, log: l1 } = testPaths();
    const { rules: r2, log: l2 } = testPaths();

    const layer1 = createMyelin({ llm: async () => ({ action: 'skip' as Action, reason: 'x' }), rulesPath: r1, logPath: l1 });
    const layer2 = createMyelin({ llm: async () => ({ action: 'wake' as Action, reason: 'y' }), rulesPath: r2, logPath: l2 });

    const stack = createStack({ layers: [layer1, layer2] });
    const result = stack.distill();

    assert.equal(result.layers.length, 2);
    assert.ok(Array.isArray(result.crossLayerEvents));
  });
});

// ── Singleton ───────────────────────────────────────────

describe('singleton manager', () => {
  beforeEach(() => {
    clearInstances();
  });

  it('creates new instance on first call', () => {
    const { rules, log } = testPaths();
    const instance = getOrCreate('test', {
      llm: async () => ({ action: 'skip' as Action, reason: 'x' }),
      rulesPath: rules,
      logPath: log,
    });
    assert.ok(instance);
    assert.deepEqual(listInstances(), ['test']);
  });

  it('returns existing instance on second call', () => {
    const { rules, log } = testPaths();
    const config = {
      llm: async () => ({ action: 'skip' as Action, reason: 'x' }),
      rulesPath: rules,
      logPath: log,
    };

    const first = getOrCreate('test', config);
    const second = getOrCreate('test', config);
    assert.equal(first, second, 'Should return the same instance');
  });

  it('getInstance returns undefined for non-existent', () => {
    assert.equal(getInstance('nope'), undefined);
  });

  it('removeInstance deletes an instance', () => {
    const { rules, log } = testPaths();
    getOrCreate('x', { llm: async () => ({ action: 'skip' as Action, reason: '' }), rulesPath: rules, logPath: log });
    assert.equal(removeInstance('x'), true);
    assert.equal(getInstance('x'), undefined);
  });

  it('clearInstances removes all', () => {
    const { rules, log } = testPaths();
    getOrCreate('a', { llm: async () => ({ action: 'skip' as Action, reason: '' }), rulesPath: rules, logPath: log });
    const { rules: r2, log: l2 } = testPaths();
    getOrCreate('b', { llm: async () => ({ action: 'skip' as Action, reason: '' }), rulesPath: r2, logPath: l2 });
    clearInstances();
    assert.deepEqual(listInstances(), []);
  });
});

// ── MyelinStats extended fields ─────────────────────────

describe('MyelinStats extended fields', () => {
  it('includes heuristic and observe stats', async () => {
    const { rules, log } = testPaths();
    const myelin = createMyelin({
      llm: async () => ({ action: 'wake' as Action, reason: 'llm' }),
      heuristic: (event) => event.type === 'timer' ? { action: 'skip' as Action, reason: 'h' } : null,
      rulesPath: rules,
      logPath: log,
    });

    myelin.observe({ type: 'test' });
    await myelin.triage({ type: 'timer' }); // heuristic
    await myelin.triage({ type: 'message' }); // llm

    const s = myelin.stats();
    assert.equal(s.observeCount, 1);
    assert.equal(s.heuristicDecisions, 1);
    assert.equal(s.llmDecisions, 1);
    assert.equal(s.totalDecisions, 2); // observe doesn't count as decision
    assert.equal(typeof s.avgHeuristicLatencyMs, 'number');
  });
});
