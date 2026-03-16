import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createMyelin } from '../src/index.ts';
import { formatMethodology } from '../src/methodology.ts';
import { unlinkSync, existsSync } from 'node:fs';
import type { Action } from '../src/types.ts';

const TEST_RULES = '/tmp/myelin-integration-rules.json';
const TEST_LOG = '/tmp/myelin-integration-decisions.jsonl';

function cleanup() {
  for (const f of [TEST_RULES, TEST_LOG]) {
    if (existsSync(f)) unlinkSync(f);
  }
}

describe('createMyelin integration', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('calls LLM when no rules exist', async () => {
    let llmCalled = false;
    const myelin = createMyelin({
      llm: async () => {
        llmCalled = true;
        return { action: 'wake' as Action, reason: 'needs attention' };
      },
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
    });

    const result = await myelin.triage({ type: 'message' });
    assert.ok(llmCalled);
    assert.equal(result.action, 'wake');
    assert.equal(result.method, 'llm');
  });

  it('uses rules instead of LLM when rule matches', async () => {
    let llmCalled = false;
    const myelin = createMyelin({
      llm: async () => {
        llmCalled = true;
        return { action: 'wake' as Action, reason: 'llm decided' };
      },
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
    });

    myelin.addRule({ match: { type: 'timer' }, action: 'skip', reason: 'manual rule' });

    const result = await myelin.triage({ type: 'timer' });
    assert.ok(!llmCalled);
    assert.equal(result.action, 'skip');
    assert.equal(result.method, 'rule');
    assert.ok(result.latencyMs <= 5);
  });

  it('fail-open when LLM throws', async () => {
    const myelin = createMyelin({
      llm: async () => { throw new Error('API down'); },
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
      failOpen: true,
      failOpenAction: 'wake',
    });

    const result = await myelin.triage({ type: 'alert' });
    assert.equal(result.action, 'wake');
    assert.equal(result.method, 'error');
    assert.ok(result.reason.includes('API down'));
  });

  it('throws when failOpen is false', async () => {
    const myelin = createMyelin({
      llm: async () => { throw new Error('API down'); },
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
      failOpen: false,
    });

    await assert.rejects(() => myelin.triage({ type: 'alert' }), { message: 'API down' });
  });

  it('tracks stats correctly', async () => {
    const myelin = createMyelin({
      llm: async () => ({ action: 'wake' as Action, reason: 'llm' }),
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
    });

    myelin.addRule({ match: { type: 'timer' }, action: 'skip', reason: 'rule' });

    await myelin.triage({ type: 'timer' });   // rule
    await myelin.triage({ type: 'timer' });   // rule
    await myelin.triage({ type: 'message' }); // llm

    const s = myelin.stats();
    assert.equal(s.totalDecisions, 3);
    assert.equal(s.ruleDecisions, 2);
    assert.equal(s.llmDecisions, 1);
    assert.ok(s.ruleCoverage > 60);
  });

  it('full crystallization lifecycle', async () => {
    const myelin = createMyelin({
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
      await myelin.triage({ type: 'timer', context: { changed: false, idle_seconds: 30 } });
    }

    assert.equal(myelin.stats().llmDecisions, 10);
    assert.equal(myelin.stats().ruleDecisions, 0);

    // Find candidates
    const candidates = myelin.getCandidates({ minOccurrences: 5, minConsistency: 0.95 });
    assert.ok(candidates.length >= 1);
    assert.equal(candidates[0].suggestedAction, 'skip');
    assert.equal(candidates[0].consistency, 1.0);

    // Crystallize
    const rule = myelin.crystallize(candidates[0]);
    assert.ok(rule.id.startsWith('rule_'));
    assert.equal(rule.action, 'skip');
    assert.equal(myelin.getRules().length, 1);

    // Now the same event should hit the rule, not the LLM
    const result = await myelin.triage({ type: 'timer', context: { changed: false, idle_seconds: 30 } });
    assert.equal(result.method, 'rule');
    assert.equal(result.action, 'skip');
    assert.equal(myelin.stats().ruleDecisions, 1);
  });

  it('addRule and removeRule work', () => {
    const myelin = createMyelin({
      llm: async () => ({ action: 'wake' as Action, reason: 'test' }),
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
    });

    const rule = myelin.addRule({ match: { type: 'x' }, action: 'skip', reason: 'test' });
    assert.equal(myelin.getRules().length, 1);

    const removed = myelin.removeRule(rule.id);
    assert.ok(removed);
    assert.equal(myelin.getRules().length, 0);

    assert.ok(!myelin.removeRule('nonexistent'));
  });

  it('logs decisions to JSONL', async () => {
    const myelin = createMyelin({
      llm: async () => ({ action: 'wake' as Action, reason: 'test' }),
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
      autoLog: true,
    });

    await myelin.triage({ type: 'message' });
    await myelin.triage({ type: 'alert' });

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

describe('Three-layer distillation (closed loop)', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('getTemplates returns templates from current rules', () => {
    const myelin = createMyelin({
      llm: async () => ({ action: 'skip' as Action, reason: 'test' }),
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
    });

    // Add rules with same structure → should form a template
    myelin.addRule({ match: { type: 'timer', context: { idle: true, seconds: { lte: 60 } } }, action: 'skip', reason: 'short idle' });
    myelin.addRule({ match: { type: 'timer', context: { idle: true, seconds: { lte: 300 } } }, action: 'skip', reason: 'medium idle' });

    const templates = myelin.getTemplates();
    assert.equal(templates.length, 1);
    assert.equal(templates[0].action, 'skip');
    assert.equal(templates[0].ruleCount, 2);
    assert.equal(templates[0].invariants.eventType, 'timer');
  });

  it('getMethodology extracts dimensions and principles', () => {
    const myelin = createMyelin({
      llm: async () => ({ action: 'skip' as Action, reason: 'test' }),
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
    });

    myelin.addRule({ match: { type: 'pr', context: { is_bot: true, lines: { lte: 50 } } }, action: 'skip', reason: 'bot PR' });
    myelin.addRule({ match: { type: 'pr', context: { is_bot: true, lines: { lte: 100 } } }, action: 'skip', reason: 'bot PR' });
    myelin.addRule({ match: { type: 'alert', context: { is_bot: false, severity: 'high' } }, action: 'wake', reason: 'urgent' });
    myelin.addRule({ match: { type: 'alert', context: { is_bot: false, severity: 'critical' } }, action: 'wake', reason: 'urgent' });

    const methodology = myelin.getMethodology();
    assert.ok(methodology.dimensions.length > 0);
    assert.ok(methodology.principles.length > 0);
    assert.equal(methodology.templateCount, 2);
    assert.equal(methodology.ruleCount, 4);
  });

  it('distill() auto-crystallizes candidates into rules', async () => {
    const myelin = createMyelin({
      llm: async (event) => {
        if (event.type === 'timer' && event.context?.idle === true) {
          return { action: 'skip' as Action, reason: 'idle timer' };
        }
        return { action: 'wake' as Action, reason: 'active' };
      },
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
      crystallize: { minOccurrences: 3, minConsistency: 0.9 },
    });

    // Generate consistent LLM decisions for two patterns
    for (let i = 0; i < 5; i++) {
      await myelin.triage({ type: 'timer', context: { idle: true, seconds: 30 } });
    }
    for (let i = 0; i < 5; i++) {
      await myelin.triage({ type: 'message', context: { idle: false } });
    }

    assert.equal(myelin.getRules().length, 0);
    assert.equal(myelin.stats().llmDecisions, 10);

    const result = myelin.distill();

    // Layer 1: candidates auto-crystallized into rules
    assert.ok(result.rules.length >= 2, `Expected ≥2 rules, got ${result.rules.length}`);

    // Layer 2 + 3: pipeline runs (templates may be empty if rules are structurally unique)
    assert.ok(result.methodology.generatedAt);
    assert.ok(Array.isArray(result.templates));

    // The crystallized rule should now match
    const r1 = await myelin.triage({ type: 'timer', context: { idle: true, seconds: 30 } });
    assert.equal(r1.method, 'rule');
    assert.equal(r1.action, 'skip');
  });

  it('distill() produces full three-layer output with enough rules', () => {
    const myelin = createMyelin({
      llm: async () => ({ action: 'skip' as Action, reason: 'test' }),
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
    });

    // Manually add rules that share structure → will form templates
    myelin.addRule({ match: { type: 'pr', source: 'github', context: { is_bot: true, lines: { lte: 50 } } }, action: 'skip', reason: 'small bot PR' });
    myelin.addRule({ match: { type: 'pr', source: 'github', context: { is_bot: true, lines: { lte: 100 } } }, action: 'skip', reason: 'medium bot PR' });
    myelin.addRule({ match: { type: 'pr', source: 'github', context: { is_bot: true, lines: { lte: 200 } } }, action: 'skip', reason: 'large bot PR' });
    myelin.addRule({ match: { type: 'alert', context: { severity: 'low', auto_resolve: true } }, action: 'quick', reason: 'auto alert' });
    myelin.addRule({ match: { type: 'alert', context: { severity: 'low', auto_resolve: true } }, action: 'quick', reason: 'auto alert 2' });

    const result = myelin.distill();

    // Layer 1: 5 manually added rules
    assert.equal(result.rules.length, 5);

    // Layer 2: templates formed from structurally similar rules
    assert.ok(result.templates.length >= 2, `Expected ≥2 templates, got ${result.templates.length}`);

    // Layer 3: methodology with dimensions and principles
    assert.ok(result.methodology.dimensions.length > 0, 'Should have dimensions');
    assert.ok(result.methodology.principles.length > 0, 'Should have principles');
    assert.equal(result.methodology.ruleCount, 5);
  });

  it('closed loop: formatMethodology produces usable LLM context', () => {
    const myelin = createMyelin({
      llm: async () => ({ action: 'skip' as Action, reason: 'test' }),
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
    });

    // Build up rules
    myelin.addRule({ match: { type: 'pr', context: { is_bot: true } }, action: 'skip', reason: 'bot' });
    myelin.addRule({ match: { type: 'pr', context: { is_bot: true } }, action: 'skip', reason: 'bot 2' });
    myelin.addRule({ match: { type: 'alert', context: { severity: 'low' } }, action: 'skip', reason: 'low severity' });
    myelin.addRule({ match: { type: 'alert', context: { severity: 'low' } }, action: 'skip', reason: 'low severity 2' });

    const { methodology } = myelin.distill();
    const text = formatMethodology(methodology);

    // The formatted text should be usable as LLM system prompt context
    assert.ok(text.includes('Decision Methodology'));
    assert.ok(text.length > 50);
    // This text can be fed back to the LLM to close the loop:
    // config.llm = (event) => callLLM(event, { systemPrompt: basePrompt + text })
  });
});

describe('Custom actions (generics)', () => {
  beforeEach(cleanup);
  afterEach(cleanup);

  it('supports custom action types via process()', async () => {
    type ModelAction = 'gpt-4' | 'haiku' | 'local';
    const myelin = createMyelin<ModelAction>({
      llm: async (event) => {
        const complexity = event.context?.complexity as string;
        if (complexity === 'high') return { action: 'gpt-4', reason: 'complex query' };
        if (complexity === 'low') return { action: 'local', reason: 'simple query' };
        return { action: 'haiku', reason: 'default' };
      },
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
    });

    const result = await myelin.process({ type: 'custom', context: { complexity: 'high' } });
    assert.equal(result.action, 'gpt-4');
    assert.equal(result.method, 'llm');
  });

  it('process() and triage() return the same result', async () => {
    const myelin = createMyelin({
      llm: async () => ({ action: 'skip' as Action, reason: 'test' }),
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
      autoLog: false,
    });

    const r1 = await myelin.process({ type: 'timer' });
    const r2 = await myelin.triage({ type: 'timer' });
    assert.equal(r1.action, r2.action);
    assert.equal(r1.method, r2.method);
  });

  it('crystallizes custom actions', async () => {
    type Priority = 'p0' | 'p1' | 'p2';
    const myelin = createMyelin<Priority>({
      llm: async () => ({ action: 'p2', reason: 'low priority' }),
      rulesPath: TEST_RULES,
      logPath: TEST_LOG,
      crystallize: { minOccurrences: 5, minConsistency: 0.95 },
    });

    // Generate consistent decisions
    for (let i = 0; i < 10; i++) {
      await myelin.process({ type: 'timer', context: { idle: true } });
    }

    const candidates = myelin.getCandidates({ minOccurrences: 5, minConsistency: 0.95 });
    assert.ok(candidates.length > 0);
    assert.equal(candidates[0].suggestedAction, 'p2');

    const rule = myelin.crystallize(candidates[0]);
    assert.equal(rule.action, 'p2');

    // Now should hit rule
    const result = await myelin.process({ type: 'timer', context: { idle: true } });
    assert.equal(result.method, 'rule');
    assert.equal(result.action, 'p2');
  });
});
