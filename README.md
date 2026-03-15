# mushi-kit

**Your LLM keeps making the same decisions. Make them once, then never again.**

mushi-kit watches your LLM's outputs, finds repeated patterns, and crystallizes them into instant, zero-cost rules — automatically. Works with any LLM, any action type, any classification task.

```
Week 1:  ████████████████████░░░░  78% LLM
Week 2:  █████░░░░░░░░░░░░░░░░░░░  25% LLM
Week 3:  ░░░░░░░░░░░░░░░░░░░░░░░░   0% LLM
```

## The Problem

If you're using an LLM to make repeated decisions, you're burning money on patterns it already knows:

- A **support bot** classifies 200 tickets/day — but 80% are routine questions it always routes the same way
- An **AI agent** triages 1000 alerts/day — but 95% are noise it always skips
- A **model router** picks between GPT-4/Haiku/local for each query — but most queries clearly map to one model
- A **content filter** checks every post — but most match patterns it's seen hundreds of times

Each repeated call costs **time** (500-2000ms), **money** ($0.001-0.01/call), and **reliability** (LLMs can respond differently each time). Your LLM is spending most of its budget re-learning what it already knows.

mushi-kit fixes this. It watches your LLM's decisions, identifies stable patterns, and promotes them to deterministic rules — instant, free, and 100% consistent. The LLM only handles genuinely novel inputs.

## How It Works

```
Input → [Rules] → match? → instant result (0ms, $0)
              ↘ no match → [Your LLM] → result + log
                                              ↓
                                   [Crystallizer] → stable pattern? → new rule
```

**Adaptive immunity becoming innate immunity.** The LLM handles novel cases; rules handle everything it's seen before.

## Quick Start

**Requires Node.js >= 18.** ESM only (`"type": "module"` in your package.json).

```bash
npm install mushi-kit
```

### Try It in 60 Seconds

Copy this into `demo.mjs` and run `node demo.mjs` — no API keys needed:

```javascript
import { createMushi } from 'mushi-kit';

const mushi = createMushi({
  // Replace this with your real LLM (OpenAI, Claude, Ollama, etc.)
  llm: async (event) => {
    if (event.context?.author === 'dependabot[bot]')
      return { action: 'skip', reason: 'automated dependency update' };
    if (event.context?.isDM)
      return { action: 'wake', reason: 'direct message from human' };
    return { action: 'quick', reason: 'standard notification' };
  },
});

// Step 1: Feed it 15 similar events
for (let i = 0; i < 15; i++) {
  await mushi.process({
    type: 'alert', source: 'github',
    context: { title: `dependabot: bump pkg-${i}`, author: 'dependabot[bot]' },
  });
}
console.log('After 15 calls:', mushi.stats());
// → { ruleCount: 0, llmDecisions: 15, ruleCoverage: 0, ... }

// Step 2: Find the stable pattern
const candidates = mushi.getCandidates({ minOccurrences: 10, minConsistency: 0.95 });
console.log(`Found ${candidates.length} pattern(s) ready to crystallize`);

// Step 3: Crystallize it into a rule
if (candidates.length > 0) mushi.crystallize(candidates[0]);

// Step 4: Now it's instant — zero LLM calls
const result = await mushi.process({
  type: 'alert', source: 'github',
  context: { title: 'dependabot: bump axios', author: 'dependabot[bot]' },
});
console.log(result);
// → { action: 'skip', method: 'rule', latencyMs: 0 }
```

### With a Real LLM

Replace the mock with your actual LLM call:

```javascript
import { createMushi } from 'mushi-kit';
import OpenAI from 'openai'; // or any LLM client

const openai = new OpenAI();

const mushi = createMushi({
  llm: async (event) => {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: `Classify this event: ${JSON.stringify(event)}. Reply with JSON: {"action": "skip"|"wake"|"quick", "reason": "..."}` }],
      response_format: { type: 'json_object' },
    });
    return JSON.parse(response.choices[0].message.content);
  },
});

// Same API — mushi handles the rest
const result = await mushi.process({ type: 'alert', context: { title: '...' } });
```

### Example: LLM Model Router

mushi-kit isn't limited to skip/wake/quick — use **any action type** with TypeScript generics:

```typescript
import { createMushi } from 'mushi-kit';

// Define your own action types
type Model = 'gpt-4' | 'haiku' | 'local';

const router = createMushi<Model>({
  llm: async (event) => {
    // Your routing logic (called only for novel query patterns)
    if (event.context?.complexity === 'high') {
      return { action: 'gpt-4', reason: 'complex reasoning needed' };
    }
    return { action: 'haiku', reason: 'simple query' };
  },
  failOpenAction: 'haiku', // safe default if LLM fails
});

const choice = await router.process({
  type: 'query',
  context: { complexity: 'low', topic: 'greeting' },
});
// → { action: 'haiku', method: 'rule', latencyMs: 0 }
//   (after the pattern crystallizes)
```

This works for **any classification task**: priority levels (`'p0' | 'p1' | 'p2'`), routing destinations, response templates, moderation labels — anything your LLM decides repeatedly.

## Use Cases

| Use Case | Actions | What Crystallizes |
|----------|---------|-------------------|
| **Notification triage** | skip / wake / quick | "Dependabot PRs → skip", "DMs from team → wake" |
| **Model routing** | gpt-4 / haiku / local | "Greetings → local", "Code review → gpt-4" |
| **Support ticket routing** | billing / technical / spam | "Password reset → technical", "Nigerian prince → spam" |
| **Priority classification** | p0 / p1 / p2 | "Disk 95% → p0", "CPU spike on cron → p2" |
| **Content moderation** | approve / flag / reject | "Greeting posts → approve", "Known spam → reject" |
| **Intent detection** | search / buy / support / browse | "Where is my order → support", "Show me X → search" |

If your LLM makes the same type of decision repeatedly, mushi-kit can learn and replace the stable patterns.

## Real Data

From a production AI agent running 24/7:

| Metric | Day 1 | Day 14 | Day 17 |
|--------|-------|--------|--------|
| Rule coverage | 22% | 96.7% | 100% |
| LLM calls/day | ~400 | ~13 | 0 |
| Avg latency | 800ms | 12ms | 0ms |
| Cost | $0* | $0* | $0* |

*Using a local 0.8B model. With API-based LLMs (GPT-4, Claude, etc.), savings scale with call volume — a system making 1000 calls/day at $0.005/call saves ~$150/month once patterns stabilize.

## Key Concepts

### Actions

By default, mushi-kit uses three triage actions: `'skip'`, `'wake'`, `'quick'`. But you can use **any string type** via TypeScript generics:

```typescript
// Default: triage
const mushi = createMushi({ llm: ... });

// Custom: model routing
const router = createMushi<'gpt-4' | 'haiku' | 'local'>({ llm: ... });

// Custom: priority levels
const prioritizer = createMushi<'p0' | 'p1' | 'p2'>({ llm: ... });
```

### Rules vs LLM

| | Rules | LLM |
|---|---|---|
| Speed | 0ms | 500-2000ms |
| Cost | $0 | $0.001-0.01/call |
| Reliability | 100% deterministic | ~95% (may vary) |
| Flexibility | Fixed patterns only | Handles novel inputs |

### Crystallization

A decision "crystallizes" when:
1. The LLM has seen a pattern **10+ times** (configurable)
2. It returned the **same action every time** (>=95% consistency)
3. A human (or auto-crystallizer) **promoted it** to a rule

Conservative by default — a wrong rule is worse than no rule.

### Fail Modes

- **LLM offline** → fail-open (configurable default action)
- **Rules file corrupt** → fall back to LLM-only mode
- **Unknown input** → LLM handles it, logs for future crystallization

## API

### `createMushi<A>(config)`

```typescript
import { createMushi } from 'mushi-kit';

const mushi = createMushi<ActionType>({
  // Required: your LLM function
  llm: (event) => Promise<{ action: ActionType; reason: string }>,

  // Optional configuration
  rulesPath: './mushi-rules.json',       // where rules are stored
  logPath: './mushi-decisions.jsonl',     // where decisions are logged
  autoLog: true,                          // log all decisions
  failOpen: true,                         // return default on LLM error
  failOpenAction: 'wake',                 // default action on error
  crystallize: {
    minOccurrences: 10,                   // decisions before eligible
    minConsistency: 0.95,                 // consistency threshold
  },
});
```

### `mushi.process(event)` / `mushi.triage(event)`

Classify an input. `process()` is the primary API; `triage()` is an alias for backward compatibility.

```typescript
const result = await mushi.process({
  type: 'alert',                    // event type (any string)
  source: 'github',                 // optional: event source
  context: { title: '...' },       // optional: structured data
});
// → { action: 'skip', reason: '...', method: 'rule', latencyMs: 0, ruleId?: '...' }
```

### `mushi.getCandidates(opts?)`

Find patterns stable enough to crystallize.

```typescript
const candidates = mushi.getCandidates({
  minOccurrences: 10,   // optional override
  minConsistency: 0.95, // optional override
});
```

### `mushi.crystallize(candidate)`

Promote a candidate to a permanent rule. Returns the new `Rule`.

### `mushi.stats()`

```typescript
const s = mushi.stats();
// { ruleCount, totalDecisions, ruleDecisions, llmDecisions, errorDecisions,
//   ruleCoverage, avgRuleLatencyMs, avgLlmLatencyMs }
```

### `mushi.addRule(rule)` / `mushi.removeRule(id)` / `mushi.getRules()`

Manually manage rules. `addRule` auto-generates `id`, `createdAt`, and `hitCount`.

```typescript
mushi.addRule({
  match: { type: 'alert', context: { severity: { lte: 2 } } },
  action: 'skip',
  reason: 'low severity alerts are noise',
});
```

## Decision Log

Every decision is logged to JSONL (`mushi-decisions.jsonl` by default):

```json
{"ts":"2026-03-15T10:30:00.000Z","event":{"type":"alert","context":{"title":"..."}},"action":"skip","reason":"...","method":"llm","latencyMs":803}
```

This log powers crystallization — `getCandidates()` reads it to find stable patterns. Also useful for debugging and auditing:

```bash
# Count decisions by method
grep -o '"method":"[^"]*"' mushi-decisions.jsonl | sort | uniq -c

# See all LLM decisions (the expensive ones)
grep '"method":"llm"' mushi-decisions.jsonl
```

Disable with `autoLog: false`.

## Zero Dependencies

Node.js built-ins only. No database. Rules in JSON, decisions in JSONL — human-readable, git-trackable.

## The Pattern

This isn't novel computer science. It's the same process everywhere:

- **Immune system**: adaptive response → memory → innate-like response
- **Law**: case judgments → precedent → statute
- **Software**: manual debugging → automated tests
- **Science**: experiments → theories → laws

**Intelligence is expensive. Crystallized intelligence is free.**

## Why Not Just Cache / Use Better Prompts?

**vs. Caching (GPTCache, etc.)**: Caching stores exact responses. mushi-kit learns *patterns* — it generalizes across similar inputs and produces deterministic rules you can inspect, edit, and version-control.

**vs. Better Prompts**: Better prompts reduce LLM errors. mushi-kit reduces LLM *calls*. They're complementary:
1. Improve your prompts (better decisions)
2. Crystallize stable decisions (eliminate redundant calls)
3. The LLM focuses only on genuinely novel inputs

## Comparison

| Approach | Method | Token Reduction | Hardware |
|----------|--------|----------------|----------|
| SAGE (Alibaba) | RL training | ~59% | 32x H100 |
| Prompt optimization | Better prompts | ~20-40% | Same |
| GPTCache | Response caching | Varies | Same |
| **mushi-kit** | Pattern crystallization | **up to ~100%** | Any |

SAGE makes the brain more efficient. Caching remembers past answers. **mushi-kit makes the brain unnecessary for known patterns.**

## License

MIT

---

*Built by [Kuro](https://kuro.page), a perception-driven AI agent. mushi-kit is extracted from [mini-agent](https://github.com/miles990/mini-agent)'s mushi subsystem, which eliminated its own LLM calls in 17 days.*
