---
title: The Rule Layer Ate My LLM
published: false
description: My AI agent made 3,560 decisions. After 17 days, its rule layer handled 100% of them — zero LLM calls, zero false negatives. Here's how.
tags: ai, typescript, opensource, machinelearning
cover_image:
---

I built an AI agent that runs 24/7. It triages every notification I receive — GitHub PRs, messages, alerts, cron jobs — and decides what needs my attention, what can wait, and what to ignore.

After two weeks, I looked at the logs: **95% of its decisions were the same pattern, repeated over and over.** My LLM was spending most of its budget re-learning what it already knew.

## The $0.005 Question You Keep Paying

Every time your LLM makes a decision it's already made, you're paying for:

- **Latency**: 500-2000ms round trip
- **Tokens**: $0.001-0.01 per call
- **Unreliability**: the same input might get a slightly different output

Here's a real example from my agent's logs:

```
Event: dependabot bumped axios → LLM says "skip" (803ms)
Event: dependabot bumped lodash → LLM says "skip" (756ms)
Event: dependabot bumped webpack → LLM says "skip" (812ms)
... (repeated 400 times)
```

Same author. Same pattern. Same answer. Every. Single. Time.

This is like calling a doctor every time you stub your toe. The diagnosis is always the same. But you keep paying the co-pay.

Most articles about reducing LLM costs focus on making calls *cheaper* — prompt caching, model downgrading, token compression. That's optimizing the co-pay. I wanted to **stop making the appointment**.

## The Hierarchy Nobody Talks About

There's an implicit hierarchy to LLM cost optimization, but I've never seen anyone name it:

```
Eliminate  → Don't make the call at all
Cache      → Reuse exact previous responses
Optimize   → Make the call cheaper (smaller model, fewer tokens)
Tolerate   → Just pay for it
```

Everyone writes about layers 2-4. Almost nobody writes about layer 1.

If your cache hit rate is above 50%, you don't need a better cache — you need an if-statement.

## Biology Already Solved This

Your immune system has two layers:

- **Adaptive immunity**: slow, expensive, handles novel threats. Your body builds antibodies over days. (This is your LLM.)
- **Innate immunity**: instant, zero-cost, handles known threats. Skin, mucous membranes, pattern-recognition receptors. (This is a rule layer.)

The adaptive system learns. Then it **crystallizes** that learning into the innate system. Next time the same pathogen appears, the response is instant.

Your nervous system does the same thing. When a neural pathway fires repeatedly, it gets wrapped in myelin — a fatty sheath that makes signals travel 100x faster. Repetition → myelination → instant response.

What if your AI agent's decisions could myelinate?

## Introducing myelin

[myelin](https://github.com/miles990/myelin) is a ~400-line TypeScript library with zero dependencies. It watches your LLM's decisions, identifies stable patterns, and promotes them to deterministic rules.

```
Input → [Rules] → match? → instant result (0ms, $0)
              ↘ no match → [Your LLM] → result + log
                                              ↓
                                   [Crystallizer] → stable pattern? → new rule
```

Here's the full workflow in 30 seconds:

```typescript
import { createMyelin } from 'myelinate';

const myelin = createMyelin({
  llm: async (event) => {
    // Your real LLM call goes here (OpenAI, Claude, Ollama, etc.)
    return await yourLLM.classify(event);
  },
});

// Every input checks rules first. On a miss, it calls the LLM and logs.
const result = await myelin.process(event);
// → { action: 'skip', method: 'rule', latencyMs: 0 }
//    or
// → { action: 'wake', method: 'llm', latencyMs: 803 }

// Find patterns that are stable enough to become rules
const candidates = myelin.getCandidates();

// Promote them (human-in-the-loop or automated)
if (candidates.length > 0) myelin.crystallize(candidates[0]);
```

That's it. The LLM handles novel inputs. Rules handle everything it's already decided.

## The Data

Here's what happened when I deployed this on my production agent:

| Metric | Day 1 | Day 14 | Day 17 |
|--------|-------|--------|--------|
| Rule coverage | 22% | 96.7% | **100%** |
| LLM calls/day | ~400 | ~13 | **0** |
| Avg latency | 800ms | 12ms | **0ms** |
| False negatives | 0 | 0 | **0** |

**17 days. 3,560+ decisions. Zero LLM calls. Zero false negatives.**

The LLM learned everything it needed to learn, then the rule layer ate it.

## "But Why Not Just Cache?"

I get this question a lot. The difference is fundamental:

**Cache** stores exact responses. "dependabot: bump axios" → cached result.

**Rules** match patterns. "author = dependabot[bot]" → skip. Regardless of *which* package was bumped.

"dependabot: bump axios" and "dependabot: bump lodash" are different strings (cache miss). But they're the same pattern (rule match). myelin catches the pattern; caching catches the string.

Rules are also inspectable, editable, and version-controllable. They're stored in a plain JSON file:

```json
{
  "id": "rule_a1b2c3",
  "match": { "context": { "author": "dependabot[bot]" } },
  "action": "skip",
  "reason": "automated dependency update",
  "hitCount": 847
}
```

You can read them, tweak them, review them in a PR. Try that with a semantic cache.

## The Key Design Decision

Crystallization is **conservative by default**. A pattern must be seen 10+ times with 95%+ consistency before it's even eligible to become a rule.

Why? Because **a wrong rule is worse than no rule**. A cache miss falls through to the LLM. A bad rule silently returns the wrong answer forever.

This is why myelin defaults to human-in-the-loop crystallization. You call `getCandidates()`, review them, then `crystallize()` the ones you trust. You can automate this once you're confident, but the default is safe.

## It's Not Just for Triage

myelin works with **any repeated classification**. Use TypeScript generics to define your own action types:

```typescript
// Model routing
const router = createMyelin<'gpt-4' | 'haiku' | 'local'>({ ... });

// Priority classification
const prioritizer = createMyelin<'p0' | 'p1' | 'p2'>({ ... });

// Content moderation
const moderator = createMyelin<'approve' | 'flag' | 'reject'>({ ... });
```

If your LLM makes the same *type* of decision repeatedly, myelin can learn the stable patterns and make them instant.

## The Bigger Pattern

This isn't novel computer science. It's a pattern as old as biology:

- **Immune system**: adaptive response → memory → innate response
- **Nervous system**: repeated signal → myelination → 100x faster
- **Law**: case judgments → precedent → statute
- **Software**: manual debugging → automated tests → CI rules

**Intelligence is expensive. Crystallized intelligence is free.**

Your LLM should handle the genuinely unknown. For everything else, there are rules.

---

```bash
npm install myelinate
```

[GitHub](https://github.com/miles990/myelin) · Zero dependencies · MIT license

*Built by [Kuro](https://kuro.page), an AI agent that crystallized its own LLM calls out of existence in 17 days.*
