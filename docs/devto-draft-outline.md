# Dev.to Article: "The Rule Layer Ate My LLM"

## Target
- Dev.to (crosspost to HN later)
- Audience: developers using LLMs in production, AI agent builders
- Tone: conversational, data-driven, slightly provocative
- Length: ~1500 words (5-7 min read)

## Hook (2 paragraphs)

I built an AI agent that runs 24/7. It triages notifications, decides what needs attention, what to skip.

After two weeks, I noticed something: **95% of its decisions were the same pattern, over and over.** My LLM was spending most of its budget re-learning what it already knew.

## The Problem (3 paragraphs)

LLMs are general-purpose reasoning engines. We use them for everything — including decisions they've already made a thousand times.

Real example: "dependabot bumped a package" → skip. Every. Single. Time. But my agent still calls the LLM, waits 800ms, burns tokens, gets the same answer.

This is like calling a doctor every time you stub your toe. The answer is always the same: you're fine.

## The Insight: Adaptive → Innate (2 paragraphs)

Biology already solved this. Your immune system has two layers:
- **Adaptive**: slow, expensive, handles novel threats (= your LLM)
- **Innate**: instant, zero-cost, handles known threats (= crystallized rules)

What if your AI decisions could myelinate — like neural pathways that fire 100x faster after repetition?

## Introducing myelin (3 paragraphs + code block)

`myelin` is a 400-line TypeScript library (zero dependencies) that does exactly this.

```
Input → [Rules] → match? → instant (0ms, $0)
              ↘ no match → [LLM] → result + log → stable? → new rule
```

Show the 60-second Quick Start (simplified).

## Real Data (table + chart)

From my production agent (3,560+ decisions):

| Metric | Day 1 | Day 14 | Day 17 |
|--------|-------|--------|--------|
| Rule coverage | 22% | 96.7% | 100% |
| LLM calls/day | ~400 | ~13 | 0 |

**17 days. Zero LLM calls. Zero false negatives.**

The LLM ate itself — or rather, its rule layer ate it.

## How It Actually Works (technical section)

1. **Process**: every input checks rules first (O(n) scan, microseconds)
2. **Log**: misses go to LLM, decisions logged to JSONL
3. **Crystallize**: `getCandidates()` finds patterns with 95%+ consistency over 10+ occurrences
4. **Promote**: human-in-the-loop (or auto) promotes to deterministic rules

Key design decision: conservative by default. A wrong rule is worse than no rule.

## Why Not Just Cache? (2 paragraphs)

Cache stores exact responses. myelin learns *patterns*.

"dependabot: bump axios" and "dependabot: bump lodash" are different strings (cache miss) but the same pattern (rule match: author=dependabot → skip).

## The Bigger Pattern (closing)

This isn't novel computer science:
- Immune system: adaptive → memory → innate
- Law: case judgments → precedent → statute
- Neural pathways: repetition → myelination → 100x faster

**Intelligence is expensive. Crystallized intelligence is free.**

Your LLM should handle the unknown. For everything else, there are rules.

## CTA

```bash
npm install myelinate
```

GitHub: https://github.com/miles990/myelin

---

## Writing Notes
- Lead with the production data — that's the hook
- Keep code minimal (one example, not three)
- The biology metaphor is the differentiation — lean into it
- Don't oversell: myelin is for repeated classification decisions, not all LLM usage
- Tags: #ai #typescript #opensource #machinelearning
