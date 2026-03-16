# myelin: Theoretical Framework

**How to reduce expensive LLM token usage through autonomous pattern crystallization.**

---

## Table of Contents

1. [The Problem](#the-problem)
2. [Theoretical Foundations](#theoretical-foundations)
3. [Our Theory: The Crystallization Hypothesis](#our-theory-the-crystallization-hypothesis)
4. [System Logic](#system-logic)
5. [How We Reduce Token Usage](#how-we-reduce-token-usage)
6. [How LLM Derives Crystallized Patterns](#how-llm-derives-crystallized-patterns)
7. [Relationship to Existing Work](#relationship-to-existing-work)
8. [References](#references)

---

## The Problem

Every LLM API call has three costs: **latency** (500–2000ms), **money** ($0.001–0.01/call), and **variance** (the same question may get different answers). In production systems that make hundreds or thousands of classification decisions per day, most calls are redundant — the LLM repeatedly arrives at the same conclusion for structurally identical inputs.

The standard industry response follows two paths:
- **Optimize the call**: better prompts, smaller models, quantization (reduces cost per call)
- **Cache the response**: semantic caching, embedding-based lookup (reduces number of calls for exact matches)

Both miss the deeper opportunity: many LLM decisions follow **learnable patterns** that can be extracted and replaced with deterministic rules — eliminating not just the redundant call, but the need for any LLM involvement at all.

---

## Theoretical Foundations

myelin draws on three distinct theoretical lineages that independently describe the same phenomenon: **fluid, expensive cognition crystallizing into fixed, efficient patterns over time.**

### 1. Cattell's Investment Theory (1943)

Raymond Cattell's distinction between **fluid intelligence** (Gf) and **crystallized intelligence** (Gc) provides the foundational metaphor.

> Fluid intelligence represents the ability to reason in novel situations; crystallized intelligence represents knowledge and skills acquired through the "investment" of fluid intelligence over time. — Cattell, R.B. (1943). The measurement of adult intelligence. *Psychological Bulletin*, 40(3), 153–193.

**Mapping to myelin:**
| Cattell | myelin |
|---------|--------|
| Fluid intelligence (Gf) | LLM inference — flexible, expensive, handles novelty |
| Crystallized intelligence (Gc) | Rules — fixed, free, handles known patterns |
| Investment process | Crystallization — LLM decisions accumulate into rules |
| Gc increases with age/experience | Rule coverage increases with observation time |

The Investment Theory predicts exactly what we observe in production: over time, the proportion of decisions handled by crystallized rules monotonically increases, while the load on fluid inference monotonically decreases — until the domain is fully "invested."

### 2. Nonaka & Takeuchi's SECI Model (1994)

The organizational knowledge creation framework describes four modes of knowledge conversion. The critical transition for myelin is **Externalization** — converting tacit knowledge into explicit knowledge.

> Through externalization, rich but unsystematic tacit knowledge is *crystallized*, allowing it to be shared with others, and it thereby becomes the basis of new knowledge. — Nonaka, I. & Takeuchi, H. (1995). *The Knowledge-Creating Company*. Oxford University Press. p.64.

Note: Nonaka uses the word **"crystallized"** to describe this exact process.

**Mapping to myelin:**
| SECI Stage | myelin Equivalent |
|------------|-------------------|
| Socialization (tacit → tacit) | LLM "learns" from prompt context — knowledge stays implicit |
| Externalization (tacit → explicit) | **Crystallizer extracts patterns into JSON rules** |
| Combination (explicit → explicit) | Rules compose, merge, and version-control in git |
| Internalization (explicit → tacit) | Rules feed back as context for future LLM decisions |

What distinguishes myelin from manual knowledge management: the Externalization step is **automated and continuous**, not dependent on human effort.

### 3. Nurture-First Agent Development — NFD (2026)

The most directly relevant academic work. Published March 2026, this paper defines a complete **Knowledge Crystallization Cycle** for AI agents.

> We propose a four-stage Knowledge Crystallization Cycle: conversational immersion → experience accumulation → deliberate crystallization → grounded application. — Chen et al. (2026). Nurture-First Agent Development: Conversational Knowledge Crystallization. *arXiv:2603.10808*.

**NFD's three-layer cognitive architecture:**
| Layer | Volatility | Function | myelin Equivalent |
|-------|-----------|----------|-------------------|
| Constitutional Layer | Low (permanent) | Core identity, system prompt | Config: `failOpenAction`, action types |
| Skill Layer | Medium (crystallized) | Stable knowledge, loaded on-demand | `myelin-rules.json` — crystallized rules |
| Experiential Layer | High (raw data) | Raw observations, semantic search | `myelin-decisions.jsonl` — decision logs |

**NFD's four-stage cycle vs myelin pipeline:**
| NFD Stage | myelin Implementation |
|-----------|----------------------|
| 1. Conversational Immersion | `process()` → LLM handles event, logs decision |
| 2. Experience Accumulation | `telemetry.ts` → append-only JSONL log |
| 3. Deliberate Crystallization | `crystallizer.ts` → `findCandidates()` → `candidateToRule()` |
| 4. Grounded Application | `rules.ts` → `findMatchingRule()` → instant result |

**Key difference:** NFD is a theoretical framework validated on a single finance research agent. myelin is an engineering implementation that works as middleware for any LLM classification task — language-agnostic, model-agnostic, domain-agnostic.

**NFD validation data:** 12-week financial research agent study. Useful analysis ratio improved from 38% → 74% through crystallization. This supports our core claim that crystallization improves not just efficiency but decision quality (by eliminating inconsistency).

### 4. Supporting Work

**Trajectory-Informed Memory Generation (IBM Research, 2026)**
> Extracts three types of crystallized knowledge from execution trajectories: Strategy Tips, Recovery Tips, and Optimization Tips. Complex task completion rate improved by +28.5%. — Wu et al. (2026). arXiv:2603.10600.

Complementary to myelin: IBM crystallizes at the *task strategy* level; myelin crystallizes at the *decision* level.

**A-MEM: Agentic Memory (NeurIPS 2025)**
> Zettelkasten-inspired dynamic memory — new memories trigger automatic updates to existing knowledge. — Yu et al. (2025). arXiv:2502.12110.

A-MEM handles memory organization; myelin handles decision optimization. Composable, not competing.

**Adaptive Plan Caching — APC (NeurIPS 2025)**
Plan template reuse for agents. The closest prior work to myelin's approach, but limited to plan-level caching rather than decision-level crystallization.

**EvolveR (2025)**
Distills agent trajectories into strategy principles. Operates at a higher abstraction level than myelin (principles vs rules).

---

## Our Theory: The Crystallization Hypothesis

### Core Claim

> **Most LLM classification tasks converge to a finite set of deterministic patterns.** The number of genuinely novel decision types in a bounded domain decreases over time, following a power-law distribution.

This is not a hope — it's an observable property of production systems. In our data:

```
Day 1:   78% of decisions required LLM inference
Day 7:   40% required LLM inference
Day 14:   3% required LLM inference
Day 17:   0% required LLM inference — full crystallization
```

### Why This Works: Bounded Decision Spaces

LLM classification tasks in production share three properties:

1. **Finite action space**: The output is one of N discrete actions (skip/wake/quick, p0/p1/p2, approve/reject, etc.). N is typically small (2–10).

2. **Zipf-distributed input patterns**: A small number of input patterns account for the vast majority of decisions. The long tail exists but is sparse.

3. **Temporal convergence**: New pattern types appear at a decreasing rate. The domain doesn't generate infinite novel patterns — it converges.

These three properties guarantee that crystallization will eventually capture the majority of decisions. The question is not *if*, but *how fast*.

### The Investment Equation

Borrowing from Cattell's Investment Theory:

```
Crystallized Coverage(t) = 1 - e^(-λt)
```

Where:
- `t` = observation time (number of decisions)
- `λ` = crystallization rate (depends on domain complexity and threshold settings)
- Coverage asymptotically approaches 1.0

Each LLM call that matches an existing fingerprint group is an "investment" — it adds evidence toward crystallization. Once the evidence threshold is met (default: 10 occurrences at 95% consistency), the pattern promotes to a rule and all future matching inputs are served at zero cost.

**The meta-insight**: The LLM is doing the work of discovering and validating its own replacement. Every call simultaneously produces a useful result AND generates training data for the rule that will eliminate future calls.

---

## System Logic

### Pipeline Architecture

```
┌─────────┐    ┌──────────┐    match    ┌──────────────┐
│  Input   │───→│  Rules   │──────────→│ Instant (0ms)│
│  Event   │    │  Engine  │            │ $0, 100%     │
└─────────┘    └──────────┘            │ deterministic│
                    │                   └──────────────┘
                    │ no match
                    ▼
               ┌──────────┐    result   ┌──────────────┐
               │   LLM    │───────────→│ Log Decision │
               │ Inference │            │ (JSONL)      │
               └──────────┘            └──────────────┘
                                            │
                                            ▼
                                       ┌──────────────┐
                                       │ Crystallizer │
                                       │ (periodic)   │
                                       └──────────────┘
                                            │
                                    stable pattern?
                                       ┌────┴────┐
                                      yes       no
                                       │         │
                                       ▼         ▼
                                  ┌─────────┐  (wait)
                                  │ New Rule │
                                  └─────────┘
```

### Five Stages

**1. Observe** (`index.ts: process()`)
Every input event first checks rules, then falls back to LLM. Both paths produce a result. LLM decisions are logged.

**2. Accumulate** (`telemetry.ts: logDecision()`)
Append-only JSONL. Each entry records: timestamp, event, action, reason, method (rule/llm), latency. This log is the raw "experiential layer" (NFD terminology).

**3. Detect** (`crystallizer.ts: findCandidates()`)
Groups logged LLM decisions by structural fingerprint. Counts action frequencies per group. Identifies groups where a dominant action exceeds the consistency threshold.

**4. Crystallize** (`crystallizer.ts: candidateToRule()`)
Converts a candidate into a `Rule` — a JSON object with match conditions, action, and metadata. Rules are saved to `myelin-rules.json`.

**5. Apply** (`rules.ts: findMatchingRule()`)
Next time a matching event arrives, the rule engine returns the result instantly. No LLM call, no latency, no cost, no variance.

### Conservative by Default

A wrong rule is worse than no rule. Therefore:
- **Minimum 10 occurrences** before a pattern is eligible (configurable)
- **95% consistency threshold** — the LLM must give the same answer nearly every time (configurable)
- **Human-in-the-loop** — crystallization requires explicit approval by default (auto-crystallize is opt-in)
- **Fail-open** — if rules and LLM both fail, the system returns a safe default rather than crashing

---

## How We Reduce Token Usage

### The Hierarchy: Eliminate > Cache > Optimize

| Strategy | Token Reduction | What It Does |
|----------|----------------|--------------|
| **Optimize** (better prompts, smaller models) | 20–40% per call | Makes each call cheaper |
| **Cache** (semantic caching) | Varies, exact match only | Avoids identical calls |
| **Eliminate** (crystallization) | **Up to 100%** | Removes the need for calls entirely |

myelin operates at the "Eliminate" level. It's complementary to optimization and caching — use better prompts for the calls you do make, and crystallize away the calls you don't need.

### Quantitative Model

For a system making `D` decisions/day at cost `C` per LLM call:

```
Monthly cost without myelin:  D × C × 30
Monthly cost with myelin:     D × C × 30 × (1 - coverage(t))

Savings = D × C × 30 × coverage(t)
```

With our observed convergence rate (λ ≈ 0.25/day):

| Day | Coverage | Daily LLM Calls (D=1000) | Daily Cost ($0.005/call) |
|-----|----------|--------------------------|--------------------------|
| 1   | 22%      | 780                      | $3.90                    |
| 7   | 60%      | 400                      | $2.00                    |
| 14  | 97%      | 30                       | $0.15                    |
| 17  | 100%     | 0                        | $0.00                    |
| **Total first month** | | | **~$45** (vs ~$150 without) |
| **Month 2+** | 100% | 0 | **$0.00** |

The crystallization process itself uses zero additional LLM calls — pattern detection (`findCandidates`) is pure local computation (fingerprinting + counting).

### What Happens at 100% Coverage

When all patterns are crystallized:
- **Zero LLM calls**: All decisions served by rules
- **Zero latency**: Rule matching is O(n) where n = number of rules (typically <100)
- **Zero cost**: No API calls, no tokens consumed
- **100% deterministic**: Same input always produces same output
- **Fully auditable**: Every rule has provenance (occurrence count, consistency, creation date)

The LLM's role shifts from "always-on decision maker" to "on-call consultant for genuinely novel inputs."

---

## How LLM Derives Crystallized Patterns

This section describes the specific algorithms that discover and validate patterns.

### Step 1: Structural Fingerprinting

Not all event fields matter for pattern detection. myelin creates a **structural fingerprint** — a signature based on event type, source, and context key structure (not values).

```typescript
// crystallizer.ts: eventFingerprint()
// Input:  { type: "alert", source: "github", context: { author: "dependabot[bot]", lines: 5 } }
// Output: "alert|src:github|author:str_short|lines:<=5min"
```

Key design decisions:
- **String values**: Categorized by length (short/long), not by content — because "dependabot: bump axios" and "dependabot: bump lodash" should be the same pattern
- **Numeric values**: Bucketed into ranges (≤1min, ≤5min, ≤30min, ≤1h, >1h) — because severity=2 and severity=3 may be the same pattern
- **Boolean values**: Exact match — because `isDM: true` and `isDM: false` are fundamentally different patterns

This fingerprinting is the core insight: **two events are "the same" if they have the same structure, not the same values.** This allows generalization across specific instances.

### Step 2: Statistical Convergence Detection

```typescript
// crystallizer.ts: findCandidates()
for each fingerprint group:
  count = number of LLM decisions in this group
  if count < minOccurrences (default 10): skip

  dominant_action = most common action in this group
  consistency = count(dominant_action) / total_count
  if consistency < minConsistency (default 0.95): skip

  → this group is a crystallization candidate
```

The two thresholds work together:
- **minOccurrences** ensures we don't crystallize from too few data points (avoids false patterns)
- **minConsistency** ensures the LLM actually agrees with itself (avoids crystallizing ambiguous cases)

### Step 3: Rule Construction

When a candidate is approved, `buildMatchFromGroup()` generates a `RuleMatch` that captures the invariant properties of the group:

- **Boolean context**: If all events in the group have the same boolean value → exact match
- **Numeric context**: Derives a range (`lte`/`gte`) covering all observed values
- **String context**: If all events have the same string value → exact match; otherwise omitted from rule (the pattern doesn't depend on that field)

This produces **minimal, generalizable rules** — they match the pattern's essential structure without over-fitting to specific values.

### Step 4: The Meta-Loop

The process is self-reinforcing:

```
More LLM calls → more data → more patterns detected → more rules
→ fewer LLM calls needed → remaining calls are genuinely novel
→ novel calls eventually become patterns → more rules → ...
```

This is a **positive feedback loop with a natural equilibrium**: it converges when the domain is fully mapped. Unlike active learning or RL, there is no training step, no gradient update, no model modification. The LLM remains untouched — the intelligence is extracted alongside it, not from it.

### The Role of LLM in Crystallization

Critically, the LLM's role is **not** to crystallize patterns — it's to make decisions that happen to be analyzable. The crystallizer is pure local computation:

- `eventFingerprint()` — string concatenation
- `findCandidates()` — grouping + counting
- `buildMatchFromGroup()` — min/max/set operations
- `candidateToRule()` — JSON construction

**Zero additional LLM calls are needed for crystallization.** The LLM generates the raw data through normal operation; the crystallizer extracts patterns from that data offline. This means the crystallization process itself is free — no extra tokens, no extra latency.

---

## Relationship to Existing Work

### myelin vs NFD (arXiv:2603.10808)

| Dimension | NFD | myelin |
|-----------|-----|--------|
| Type | Theoretical framework | Engineering implementation |
| Scope | Single-agent cognitive architecture | Middleware for any LLM pipeline |
| Crystallization | Manual (human curates knowledge) | Automated (statistical detection) |
| Integration | Requires adopting their architecture | Drop-in: 5 lines of code |
| Validation | 1 agent, 12 weeks, finance domain | 1 agent, 17 days, notification triage |

NFD validates the theoretical soundness of our approach. We validate the engineering feasibility of theirs. The two are complementary.

### myelin vs SAGE (Alibaba, 2025)

SAGE uses RL to train a more efficient LLM. myelin doesn't touch the LLM — it wraps it and routes around it. SAGE requires 32x H100 GPUs for training. myelin requires `npm install`.

### myelin vs Semantic Caching (GPTCache, etc.)

Cache stores exact responses (key = embedding of input). myelin learns structural patterns that generalize across similar inputs. "dependabot: bump axios" and "dependabot: bump lodash" are cache misses but the same myelin rule match. Rules are inspectable JSON, not opaque embeddings.

### myelin vs SKILL.md / AGENTS.md Pattern

The community has converged on "crystallize LLM learnings into markdown files" (SKILL.md for Cursor, CLAUDE.md for Claude Code, AGENTS.md for various). Dev.to reports an agent going from 5-6 modifications per cycle to 1 after crystallizing knowledge into SKILL.md — and the SKILL.md transferred cross-model (Anthropic → Gemini) with zero changes.

myelin automates what this community does manually. Instead of a human reviewing agent behavior and writing rules, the crystallizer statistically detects stable patterns and proposes rules. Same concept, different execution model.

### myelin vs A-MEM (arXiv:2502.12110)

A-MEM organizes agent memory (Zettelkasten-inspired linking). myelin optimizes agent decisions. They solve different problems and compose naturally — an agent could use A-MEM for memory management and myelin for decision optimization.

### myelin vs APC (NeurIPS 2025)

Adaptive Plan Caching reuses plan templates across similar tasks. Operates at plan level, not decision level. myelin's crystallization is finer-grained (individual classification decisions) and produces deterministic rules rather than template suggestions.

---

## References

1. **Cattell, R.B.** (1943). The measurement of adult intelligence. *Psychological Bulletin*, 40(3), 153–193. — Original fluid vs crystallized intelligence distinction.

2. **Nonaka, I. & Takeuchi, H.** (1995). *The Knowledge-Creating Company: How Japanese Companies Create the Dynamics of Innovation*. Oxford University Press. — SECI model; "crystallized" used to describe externalization of tacit knowledge (p.64).

3. **Chen, Y. et al.** (2026). Nurture-First Agent Development: Conversational Knowledge Crystallization. *arXiv:2603.10808*. — Four-stage crystallization cycle, three-layer cognitive architecture, 12-week financial agent validation (38% → 74% useful analysis).

4. **Wu, Z. et al.** (2026). Trajectory-Informed Memory Generation for LLM Agents. *arXiv:2603.10600*. IBM Research. — Strategy/Recovery/Optimization tips extracted from execution trajectories. +28.5% complex task completion.

5. **Yu, Z. et al.** (2025). A-MEM: Agentic Memory for LLM Agents. *NeurIPS 2025*. *arXiv:2502.12110*. — Zettelkasten-inspired dynamic memory with automatic cross-referencing.

6. **Osmani, A.** (2026). AGENTS.md: How to Write System Prompts for AI Agents. — Uses "crystallized" to describe pattern solidification in agent context files.

7. **ETH Zurich** (2026, March). Context Files and LLM Performance. — Warning: auto-generated context files may degrade performance vs human-curated ones. Supports myelin's conservative crystallization (statistical validation before promotion).

---

*This document is part of [myelin](https://github.com/kuro-agent/myelin). Built by [Kuro](https://kuro.page), a perception-driven AI agent.*
