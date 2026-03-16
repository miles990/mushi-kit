/**
 * Tests for new myelin features:
 * - observe()
 * - triageSafe()
 * - heuristic mode
 * - array condition matching
 * - episode recording & crystallization
 * - toPromptBlock()
 * - maybeDistill()
 * - toSmallModelPrompt()
 * - fleet
 * - stack
 * - singleton
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMyelin, readDecisionLog } from '../src/index.ts';
import { createFleet } from '../src/fleet.ts';
import { createStack } from '../src/stack.ts';
import { getOrCreate, getInstance, removeInstance, listInstances, clearInstances } from '../src/singleton.ts';
import { matchRule } from '../src/rules.ts';
import { existsSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

function tmpPath(name: string): string {
  const dir = join(tmpdir(), 'myelin-test-new');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return join(dir, `${name}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
}

function cleanup(...paths: string[]) {
  for (const p of paths) {
    try { if (existsSync(p)) unlinkSync(p); } catch {}
  }
}

describe('observe()', () => {
  it('logs observation without triggering LLM or rules', () => {
    const rulesPath = tmpPath('rules.json');
    const logPath = tmpPath('decisions.jsonl');
    let llmCalled = false;

    const m = createMyelin({
      llm: async () => { llmCalled = true; return { action: 'wake', reason: 'test' }; },
      rulesPath,
      logPath,
    });

    m.observe({ type: 'change', source: 'test', context: { key: 'val' } }, { note: 'just watching' });

    assert.equal(llmCalled, false);
    const logs = readDecisionLog(logPath);
    assert.equal(logs.length, 1);
    assert.equal(logs[0].method, 'observe');
    assert.equal(logs[0].action, 'observe');

    const s = m.stats();
    assert.equal(s.observeCount, 1);
    assert.equal(s.totalDecisions, 0);

    cleanup(rulesPath, logPath);
  });
});

describe('triageSafe()', () => {
  it('returns result on success', async () => {
    const rulesPath = tmpPath('rules.json');
    const logPath = tmpPath('decisions.jsonl');

    const m = createMyelin({
      llm: async () => ({ action: 'skip', reason: 'safe' }),
      rulesPath,
      logPath,
    });

    const result = await m.triageSafe({ type: 'timer' });
    assert.equal(result.action, 'skip');
    assert.equal(result.method, 'llm');

    cleanup(rulesPath, logPath);
  });

  it('never throws even when LLM throws and failOpen is false', async () => {
    const rulesPath = tmpPath('rules.json');
    const logPath = tmpPath('decisions.jsonl');

    const m = createMyelin({
      llm: async () => { throw new Error('boom'); },
      rulesPath,
      logPath,
      failOpen: false,
    });

    // triage() would throw, but triageSafe() should not
    const result = await m.triageSafe({ type: 'timer' });
    assert.equal(result.method, 'error');
    assert.ok(result.reason.includes('triageSafe'));

    cleanup(rulesPath, logPath);
  });
});

describe('heuristic mode', () => {
  it('uses heuristic when it returns a result', async () => {
    const rulesPath = tmpPath('rules.json');
    const logPath = tmpPath('decisions.jsonl');
    let llmCalled = false;

    const m = createMyelin({
      llm: async () => { llmCalled = true; return { action: 'wake', reason: 'llm' }; },
      heuristic: (event) => {
        if (event.type === 'timer') return { action: 'skip', reason: 'heuristic: timer events skip' };
        return null;
      },
      rulesPath,
      logPath,
    });

    const result = await m.triage({ type: 'timer' });
    assert.equal(result.action, 'skip');
    assert.equal(result.method, 'heuristic');
    assert.equal(llmCalled, false);

    const s = m.stats();
    assert.equal(s.heuristicDecisions, 1);

    cleanup(rulesPath, logPath);
  });

  it('falls through to LLM when heuristic returns null', async () => {
    const rulesPath = tmpPath('rules.json');
    const logPath = tmpPath('decisions.jsonl');

    const m = createMyelin({
      llm: async () => ({ action: 'wake', reason: 'llm decided' }),
      heuristic: () => null,
      rulesPath,
      logPath,
    });

    const result = await m.triage({ type: 'message' });
    assert.equal(result.action, 'wake');
    assert.equal(result.method, 'llm');

    cleanup(rulesPath, logPath);
  });

  it('falls through to LLM when heuristic throws', async () => {
    const rulesPath = tmpPath('rules.json');
    const logPath = tmpPath('decisions.jsonl');

    const m = createMyelin({
      llm: async () => ({ action: 'quick', reason: 'llm fallback' }),
      heuristic: () => { throw new Error('heuristic error'); },
      rulesPath,
      logPath,
    });

    const result = await m.triage({ type: 'alert' });
    assert.equal(result.action, 'quick');
    assert.equal(result.method, 'llm');

    cleanup(rulesPath, logPath);
  });
});

describe('array condition matching', () => {
  it('matches includes condition', () => {
    const result = matchRule(
      { type: 'message', context: { tags: ['urgent', 'bug', 'p0'] } },
      { type: 'message', context: { tags: { includes: 'urgent' } } },
    );
    assert.equal(result, true);
  });

  it('rejects includes when element not present', () => {
    const result = matchRule(
      { type: 'message', context: { tags: ['bug', 'p1'] } },
      { type: 'message', context: { tags: { includes: 'urgent' } } },
    );
    assert.equal(result, false);
  });

  it('matches includesAny condition', () => {
    const result = matchRule(
      { type: 'message', context: { tags: ['feature', 'p2'] } },
      { type: 'message', context: { tags: { includesAny: ['urgent', 'feature'] } } },
    );
    assert.equal(result, true);
  });

  it('matches includesAll condition', () => {
    const result = matchRule(
      { type: 'message', context: { tags: ['urgent', 'bug', 'p0'] } },
      { type: 'message', context: { tags: { includesAll: ['urgent', 'bug'] } } },
    );
    assert.equal(result, true);
  });

  it('rejects includesAll when not all present', () => {
    const result = matchRule(
      { type: 'message', context: { tags: ['urgent'] } },
      { type: 'message', context: { tags: { includesAll: ['urgent', 'bug'] } } },
    );
    assert.equal(result, false);
  });
});

describe('episodes', () => {
  it('records and retrieves episodes', () => {
    const rulesPath = tmpPath('rules.json');
    const logPath = tmpPath('decisions.jsonl');

    const m = createMyelin({
      llm: async () => ({ action: 'wake', reason: 'test' }),
      rulesPath,
      logPath,
    });

    const ep = m.recordEpisode({
      steps: [
        { event: { type: 'message' }, result: { action: 'wake', reason: 'test', method: 'llm', latencyMs: 10 }, timestamp: new Date().toISOString() },
        { event: { type: 'timer' }, result: { action: 'skip', reason: 'done', method: 'rule', latencyMs: 0 }, timestamp: new Date().toISOString() },
      ],
      outcome: 'success',
      startedAt: new Date().toISOString(),
    });

    assert.ok(ep.id.startsWith('ep_'));
    assert.equal(ep.steps.length, 2);

    const episodes = m.getEpisodes();
    assert.equal(episodes.length, 1);

    cleanup(rulesPath, logPath);
  });

  it('crystallizes episode patterns', () => {
    const rulesPath = tmpPath('rules.json');
    const logPath = tmpPath('decisions.jsonl');

    const m = createMyelin({
      llm: async () => ({ action: 'wake', reason: 'test' }),
      rulesPath,
      logPath,
    });

    // Record 5 similar episodes
    for (let i = 0; i < 5; i++) {
      m.recordEpisode({
        steps: [
          { event: { type: 'message' }, result: { action: 'wake', reason: 'test', method: 'llm', latencyMs: 10 }, timestamp: new Date().toISOString() },
          { event: { type: 'timer' }, result: { action: 'skip', reason: 'done', method: 'rule', latencyMs: 0 }, timestamp: new Date().toISOString() },
        ],
        outcome: 'success',
        startedAt: new Date().toISOString(),
      });
    }

    const rules = m.crystallizeEpisodes({ minEpisodes: 3, minSuccessRate: 0.5 });
    assert.ok(rules.length > 0);
    assert.equal(rules[0].pattern, 'wake→skip');
    assert.equal(rules[0].episodeCount, 5);
    assert.equal(rules[0].successRate, 1);

    cleanup(rulesPath, logPath);
  });
});

describe('toPromptBlock()', () => {
  it('returns XML format by default', () => {
    const rulesPath = tmpPath('rules.json');
    const logPath = tmpPath('decisions.jsonl');

    const m = createMyelin({
      llm: async () => ({ action: 'wake', reason: 'test' }),
      rulesPath,
      logPath,
    });

    m.addRule({ match: { type: 'timer' }, action: 'skip', reason: 'timer skip' });
    m.addRule({ match: { type: 'alert' }, action: 'wake', reason: 'alert wake' });

    const block = m.toPromptBlock();
    assert.ok(block.includes('<crystallized-rules>'));
    assert.ok(block.includes('</crystallized-rules>'));

    cleanup(rulesPath, logPath);
  });

  it('returns markdown format when requested', () => {
    const rulesPath = tmpPath('rules.json');
    const logPath = tmpPath('decisions.jsonl');

    const m = createMyelin({
      llm: async () => ({ action: 'wake', reason: 'test' }),
      rulesPath,
      logPath,
    });

    m.addRule({ match: { type: 'timer' }, action: 'skip', reason: 'timer skip' });

    const block = m.toPromptBlock({ format: 'markdown' });
    assert.ok(block.includes('## Crystallized Rules'));
    assert.ok(block.includes('**skip**'));

    cleanup(rulesPath, logPath);
  });
});

describe('maybeDistill()', () => {
  it('returns null when not enough decisions', () => {
    const rulesPath = tmpPath('rules.json');
    const logPath = tmpPath('decisions.jsonl');

    const m = createMyelin({
      llm: async () => ({ action: 'wake', reason: 'test' }),
      rulesPath,
      logPath,
    });

    const result = m.maybeDistill({ minNewDecisions: 10, minIntervalMs: 60000 });
    assert.equal(result, null);

    cleanup(rulesPath, logPath);
  });
});

describe('toSmallModelPrompt()', () => {
  it('returns compact prompt', () => {
    const rulesPath = tmpPath('rules.json');
    const logPath = tmpPath('decisions.jsonl');

    const m = createMyelin({
      llm: async () => ({ action: 'wake', reason: 'test' }),
      rulesPath,
      logPath,
    });

    m.addRule({ match: { type: 'timer' }, action: 'skip', reason: 'timer events skip' });

    const prompt = m.toSmallModelPrompt();
    assert.ok(prompt.includes('RULES:') || prompt.includes('TOP PATTERNS:'));

    cleanup(rulesPath, logPath);
  });
});

describe('fleet', () => {
  it('manages multiple instances', async () => {
    const r1 = tmpPath('fleet-r1.json');
    const l1 = tmpPath('fleet-l1.jsonl');
    const r2 = tmpPath('fleet-r2.json');
    const l2 = tmpPath('fleet-l2.jsonl');

    const m1 = createMyelin({ llm: async () => ({ action: 'skip', reason: 'triage' }), rulesPath: r1, logPath: l1 });
    const m2 = createMyelin({ llm: async () => ({ action: 'wake', reason: 'route' }), rulesPath: r2, logPath: l2 });

    const fleet = createFleet([
      { name: 'triage', instance: m1 },
      { name: 'routing', instance: m2 },
    ]);

    assert.deepEqual(fleet.names(), ['triage', 'routing']);
    assert.ok(fleet.get('triage'));

    // Fleet-wide observe
    fleet.observeAll({ type: 'startup' });

    // Triage through named instance
    const result = await fleet.triageWith('triage', { type: 'timer' });
    assert.ok(result);
    assert.equal(result.action, 'skip');

    // Stats
    const stats = fleet.stats();
    assert.equal(stats.members.length, 2);
    assert.equal(stats.totalDecisions, 1);

    cleanup(r1, l1, r2, l2);
  });

  it('returns null for unknown instance', async () => {
    const fleet = createFleet();
    const result = await fleet.triageWith('nonexistent', { type: 'timer' });
    assert.equal(result, null);
  });
});

describe('stack', () => {
  it('chains layers for distillation', () => {
    const r1 = tmpPath('stack-r1.json');
    const l1 = tmpPath('stack-l1.jsonl');
    const r2 = tmpPath('stack-r2.json');
    const l2 = tmpPath('stack-l2.jsonl');

    const layer1 = createMyelin({ llm: async () => ({ action: 'skip', reason: 'l1' }), rulesPath: r1, logPath: l1 });
    const layer2 = createMyelin({ llm: async () => ({ action: 'wake', reason: 'l2' }), rulesPath: r2, logPath: l2 });

    const stack = createStack({ layers: [layer1, layer2] });

    assert.equal(stack.depth(), 2);
    assert.ok(stack.layer(0));
    assert.ok(stack.layer(1));
    assert.equal(stack.layer(2), undefined);

    const result = stack.distill();
    assert.equal(result.layers.length, 2);

    cleanup(r1, l1, r2, l2);
  });
});

describe('singleton', () => {
  afterEach(() => {
    clearInstances();
  });

  it('returns same instance for same name', () => {
    const r = tmpPath('singleton.json');
    const l = tmpPath('singleton.jsonl');

    const config = { llm: async () => ({ action: 'skip' as const, reason: 'test' }), rulesPath: r, logPath: l };

    const a = getOrCreate('test', config);
    const b = getOrCreate('test', config);
    assert.equal(a, b);

    cleanup(r, l);
  });

  it('lists and removes instances', () => {
    const r = tmpPath('singleton2.json');
    const l = tmpPath('singleton2.jsonl');

    getOrCreate('alpha', { llm: async () => ({ action: 'skip' as const, reason: 'a' }), rulesPath: r, logPath: l });
    getOrCreate('beta', { llm: async () => ({ action: 'wake' as const, reason: 'b' }), rulesPath: r, logPath: l });

    assert.deepEqual(listInstances(), ['alpha', 'beta']);
    assert.ok(getInstance('alpha'));
    assert.equal(removeInstance('alpha'), true);
    assert.deepEqual(listInstances(), ['beta']);

    cleanup(r, l);
  });
});
