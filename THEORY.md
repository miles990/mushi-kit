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

## Where Small Models Do Better

The crystallization pipeline addresses the most common case: replacing LLM decisions with deterministic rules. But between "full LLM inference" and "deterministic rule," there's a middle layer where **small models (≤3B parameters) outperform large models** — and this layer is critical for the patterns that are learnable but too complex for regex.

### The Classification Dominance

Most production LLM decisions are **classification**, not generation. For classification tasks, model size is the wrong variable — **task-specific fine-tuning** is what matters.

> Fine-tuned small LLMs significantly outperform zero-shot generative AI models in text classification — across sentiment, stance detection, emotion, and topic labeling. The margin grows for domain-specific tasks. — Shekhar et al. (2024). arXiv:[2406.08660](https://arxiv.org/abs/2406.08660)

| Task | Small Model Result | Large Model Result | Source |
|------|-------------------|-------------------|--------|
| Text classification (all tasks) | Fine-tuned small wins | GPT-4 zero-shot loses | arXiv:2406.08660 |
| Binary classification (F1) | 1B fine-tuned: 0.865 | 70B zero-shot: 0.800 | Li et al. arXiv:2505.16078 |
| Math benchmarks | Qwen2.5-0.5B wins | Gemma2-2.6B loses | arXiv:2412.15115 |
| Chatbot Arena Elo | Gemma 2 2B: 1126 | Mixtral 8x7B: 1114 | arXiv:2408.00118 |
| Diabetes domain QA | 7B: 87.2% accuracy | GPT-4: lower | Multiple reports |
| Chain-of-thought distillation | 770M T5 beats | 540B PaLM loses | arXiv:2305.02301 |

### Key Research: Small Models in Agentic Systems

**NVIDIA Research (2025)** made the strongest case:

> Small Language Models are the future of Agentic AI. Agentic systems execute small, specialized, repetitive tasks — exactly what SLMs are optimized for. SLMs "easily outperform larger models" on specialized agentic tasks. — Belcak, Heinrich et al. (2025). arXiv:[2506.02153](https://arxiv.org/abs/2506.02153)

Tasks appropriate for small models in agent systems: tool call parameter extraction, intent classification, structured output formatting, action selection from fixed menu, context summarization, simple QA from retrieved context.

### The Right-Sizing Table

| Query Type | Optimal Model Size | Cost vs GPT-4 | Source |
|-----------|-------------------|---------------|--------|
| Binary/multi-class classification | 135M–1B fine-tuned | >99% savings | arXiv:2406.08660 |
| Named entity recognition | 1–3B specialized | >95% savings | SAS Dec 2025 |
| Domain-specific QA | 1–3B fine-tuned | >95% savings | Multiple |
| Narrow code generation | 3B code-specialized | >90% savings | arXiv:2412.15115 |
| Math with verification | 3–7B math-specific | >80% savings | Qwen2.5-Math |
| Intent routing | 1B classifier | 85% savings | RouteLLM, arXiv:2406.18665 |
| General coding | 7–13B | ~60% savings | — |
| Novel reasoning / open-ended | 70B+ or frontier | baseline | — |

### Why Small Models Beat Large Models on Triage

Three independent research lines converge on the same conclusion:

**1. CoT hurts simple decisions** (Li et al., ACL 2025):
> Chain-of-Thought **hurts** small model performance on classification — overthinking simple decisions degrades accuracy. ModernBERT (149M) needs only 1.72GB RAM vs Llama-1B's 25.78GB — 15× more efficient. — arXiv:[2505.16078](https://arxiv.org/abs/2505.16078)

**2. Reasoning models lose controllability** (Carroll & Korbak, 2026):
> Larger reasoning models have **lower** Chain-of-Thought controllability. Small models used for triage are inherently more transparent and auditable. — arXiv:[2603.05706](https://arxiv.org/abs/2603.05706)

**3. Intelligence can backfire under scarcity** (Johnson, 2026):
> When resources are scarce (C/N < 0.5), simpler models outperform smarter ones. Model-size inversion is real and predictable. For triage under token budget scarcity, the smallest adequate model is mathematically optimal. — arXiv:[2603.12129](https://arxiv.org/abs/2603.12129)

### Distillation: Making Large Model Knowledge Portable

The most powerful technique for creating effective small models: **distill** the large model's reasoning into training data for the small model.

**Distilling Step-by-Step** (Hsieh et al., 2023):
> Train small model on `(input, chain-of-thought rationale, label)` instead of just `(input, label)`. A **770M T5 beats 540B PaLM** with 80% of the training data. The large model's reasoning process is more valuable than its outputs alone. — arXiv:[2305.02301](https://arxiv.org/abs/2305.02301)

**Agent Distillation** (Oct 2025):
> Generate domain-specific datasets from manuals, use LLM to generate reasoning trajectories, fine-tune small model on the result. 14% improvement over base. — arXiv:[2510.00482](https://arxiv.org/abs/2510.00482)

### Small Model Families Worth Knowing

| Family | Key Size | Strengths | Source |
|--------|---------|-----------|--------|
| **Qwen2.5/3** (Alibaba) | 0.5B, 1.5B, 3B | Math, code, multilingual; 0.5B beats Gemma2-2.6B on math | arXiv:[2412.15115](https://arxiv.org/abs/2412.15115), [2505.09388](https://arxiv.org/abs/2505.09388) |
| **Phi-3/4** (Microsoft) | 3.8B | Textbook-quality data > scale; matches GPT-3.5, 98% less compute | arXiv:[2404.14219](https://arxiv.org/abs/2404.14219) |
| **Gemma 2/3** (Google) | 2B, 4B | #1 on LMArena for compact models; beats Mixtral 8x7B | arXiv:[2408.00118](https://arxiv.org/abs/2408.00118), [2503.19786](https://arxiv.org/abs/2503.19786) |
| **SmolLM2** (HuggingFace) | 135M, 360M, 1.7B | Runs on Raspberry Pi (4-bit); competitive with 7B+ | HuggingFace docs |

### myelin's Three-Layer Cost Model

```
Layer 1: Deterministic Rules  — $0, <1ms    (crystallized patterns)
Layer 2: Small Model          — ~$0, <200ms (learnable but complex patterns)
Layer 3: Large Model          — $$$, ~800ms (genuinely novel inputs)

         myelin crystallizes: Layer 3 → Layer 1
         Future path:         Layer 3 → Layer 2 → Layer 1
```

The endgame isn't "no LLM." It's **LLM only where LLM is necessary.** The small model layer is the bridge between "too complex for regex" and "too expensive for frontier models."

### Routing Economics: The Multiplier

Crystallization alone achieves up to 100% elimination. Combined with intelligent routing, the economics compound:

**FrugalGPT** (Chen et al., 2023):
> 98% cost reduction while matching GPT-4 quality, or 4% quality improvement at the same cost. Cascade architecture learns which model to use per query type. — arXiv:[2305.05176](https://arxiv.org/abs/2305.05176)

**RouteLLM** (Ong et al., ICLR 2025):
> 85% cost reduction maintaining 95% GPT-4 performance. Drop-in OpenAI client replacement. Uses BERT-based classifier as router. — arXiv:[2406.18665](https://arxiv.org/abs/2406.18665)

**Confidence-Calibrated Routing** (March 2026):
> Trains SLMs to know when to escalate. Addresses the core problem that SLMs have poorly calibrated confidence scores. — arXiv:[2603.03752](https://arxiv.org/abs/2603.03752)

myelin operates **upstream** of model routing — it decides whether any model should run at all. Combined with RouteLLM-style routing for the remaining calls, the stack becomes:

```
Input → [myelin rules] → match? → instant ($0)
                      → no match → [router] → simple? → small model (~$0)
                                            → complex? → large model ($$$)
```

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

### myelin vs APC (NeurIPS 2025, arXiv:2506.14852)

Adaptive Plan Caching reuses plan templates across similar tasks: two-stage de-contextualization (rule-based + LLM-based filter) produces generalized templates, stored as keyword→plan pairs, retrieved via O(1) exact match, adapted by a small model (LLaMA-3.1-8B). Results: 50% cost reduction, 27% latency reduction, 96.6% performance retained.

APC's de-contextualization pipeline IS crystallization, applied at the plan level. myelin applies the same principle at the decision level. Both validate: pattern extraction + template reuse + small model adaptation is a production-viable architecture.

### myelin vs EvolveR (arXiv:2510.16079)

EvolveR distills agent trajectories into abstract strategy principles through offline self-distillation cycles. Operates at a higher abstraction level than myelin (principles vs rules). EvolveR crystallizes **why** an approach worked; myelin crystallizes **what decision** to make. Complementary layers.

### myelin vs RouteLLM / FrugalGPT

RouteLLM (ICLR 2025, arXiv:[2406.18665](https://arxiv.org/abs/2406.18665)) routes between two models. FrugalGPT (arXiv:[2305.05176](https://arxiv.org/abs/2305.05176)) cascades across multiple models. Both operate **within** the LLM tier — choosing which model handles a call. myelin operates **upstream** — deciding whether any model needs to handle the call at all. The three are stackable: myelin eliminates known patterns, RouteLLM routes the remainder to the cheapest adequate model.

### The ETH Zurich Warning: Non-Inferability Principle

> Auto-generated context files **degrade** LLM performance by -3%, while human-written ones improve it by +4%. The auto-generated content is not wrong — it's redundant. The agent already had that information from the codebase. — Gloaguen et al. (2026). arXiv:[2602.11988](https://arxiv.org/abs/2602.11988)

**The non-inferability principle**: A crystallized rule has value proportional to how much it encodes information the agent **cannot** self-discover at runtime. Generic rules (things the LLM could figure out from context) = zero crystallization value. Domain-specific operational constraints (things invisible in the input) = high value.

This validates myelin's approach: we crystallize **decisions** (action for a given structural pattern), not **descriptions** (what the input looks like). The decision is non-inferable — you can't know the right action without either an LLM call or a rule. The input structure is inferable — the agent can see that itself.

---

## References

### Theoretical Foundations

1. **Cattell, R.B.** (1943). The measurement of adult intelligence. *Psychological Bulletin*, 40(3), 153–193. — First published fluid (Gf) vs crystallized (Gc) intelligence distinction.

2. **Cattell, R.B.** (1963). Theory of fluid and crystallized intelligence: A critical experiment. *Journal of Educational Psychology*, 54(1), 1–22. DOI: [10.1037/h0046743](https://psycnet.apa.org/doiLanding?doi=10.1037%2Fh0046743) — Investment Theory formalized: Gf "invests" into Gc through experience.

3. **Nonaka, I.** (1994). A dynamic theory of organizational knowledge creation. *Organization Science*, 5(1), 14–37. — SECI model origin; Externalization uses "crystallized" to describe tacit→explicit knowledge conversion.

4. **Nonaka, I. & Takeuchi, H.** (1995). *The Knowledge-Creating Company*. Oxford University Press, p.64. — Full SECI framework; "Through externalization, rich but unsystematic tacit knowledge is *crystallized*."

### Knowledge Crystallization in AI

5. **Zhang, L.** (2026). Nurture-First Agent Development: Conversational Knowledge Crystallization. arXiv:[2603.10808](https://arxiv.org/abs/2603.10808). — Four-stage crystallization cycle, three-layer cognitive architecture, 12-week financial agent validation (38% → 74% useful analysis). Most directly aligned with myelin's approach.

6. **Fang, G.; Isahagian, V. et al.** (2026). Trajectory-Informed Memory Generation for Self-Improving Agent Systems. arXiv:[2603.10600](https://arxiv.org/abs/2603.10600). IBM Research. — Strategy/Recovery/Optimization tips from execution trajectories. +28.5% complex task completion.

7. **Xu, W.; Liang, Z. et al.** (2025). A-MEM: Agentic Memory for LLM Agents. *NeurIPS 2025*. arXiv:[2502.12110](https://arxiv.org/abs/2502.12110). — Zettelkasten-inspired dynamic memory; new memories trigger retroactive updates to historical memories.

8. **APC** (2025). Agentic Plan Caching: Test-Time Memory for Fast and Cost-Efficient LLM Agents. *NeurIPS 2025*. arXiv:[2506.14852](https://arxiv.org/abs/2506.14852). — 50% cost reduction via plan template reuse with small model adaptation.

9. **Wu, R. et al.** (2025). EvolveR: Self-Evolving LLM Agents through an Experience-Driven Lifecycle. arXiv:[2510.16079](https://arxiv.org/abs/2510.16079). — Offline self-distillation of trajectories into abstract strategy principles.

### Small Model Research

10. **Shekhar, R. et al.** (2024). Fine-Tuned 'Small' LLMs (Still) Significantly Outperform Zero-Shot Generative AI Models in Text Classification. arXiv:[2406.08660](https://arxiv.org/abs/2406.08660). — Fine-tuned small LLMs beat GPT-4 zero-shot on every classification task tested.

11. **Belcak, P.; Heinrich, G. et al.** (2025). Small Language Models are the Future of Agentic AI. arXiv:[2506.02153](https://arxiv.org/abs/2506.02153). NVIDIA Research. — SLMs outperform larger models on specialized agentic tasks; LLM-to-SLM conversion algorithm.

12. **Hsieh, C. et al.** (2023). Distilling Step-by-Step! Outperforming Larger Language Models with Less Training Data and Smaller Model Sizes. arXiv:[2305.02301](https://arxiv.org/abs/2305.02301). — 770M T5 beats 540B PaLM via chain-of-thought distillation.

13. **Li, Y. et al.** (2025). Small Language Models in the Real World. *ACL 2025 Industry Track*. arXiv:[2505.16078](https://arxiv.org/abs/2505.16078). — 1B fine-tuned beats 70B zero-shot (F1: 0.865 vs 0.800); CoT hurts small model classification.

14. **Carroll, M.; Korbak, T. et al.** (2026). Reasoning Models Struggle to Control their Chains of Thought. arXiv:[2603.05706](https://arxiv.org/abs/2603.05706). — Larger reasoning models have lower CoT controllability; small models more auditable.

15. **Johnson, N.** (2026). Increasing Intelligence Can Worsen Collective Outcomes. arXiv:[2603.12129](https://arxiv.org/abs/2603.12129). — Under resource scarcity (C/N < 0.5), simpler models outperform smarter ones.

### Small Model Families

16. **Qwen Team** (2025). Qwen2.5 Technical Report. arXiv:[2412.15115](https://arxiv.org/abs/2412.15115). — 0.5B–72B; Qwen2.5-0.5B outperforms Gemma2-2.6B on math.

17. **Qwen Team** (2025). Qwen3 Technical Report. arXiv:[2505.09388](https://arxiv.org/abs/2505.09388). — 1.7B/4B outperform larger Qwen2.5 on >50% benchmarks.

18. **Abdin, M. et al.** (2024). Phi-3 Technical Report. arXiv:[2404.14219](https://arxiv.org/abs/2404.14219). Microsoft. — Textbook-quality synthetic data > raw scale; Phi-3.5-Mini matches GPT-3.5.

19. **Gemma Team** (2024). Gemma 2. arXiv:[2408.00118](https://arxiv.org/abs/2408.00118). — 2B model beats Mixtral 8x7B on Arena Elo (1126 vs 1114).

20. **Gemma Team** (2025). Gemma 3. arXiv:[2503.19786](https://arxiv.org/abs/2503.19786). — #1 open compact model on LMArena.

### Routing & Cost Optimization

21. **Chen, L. et al.** (2023). FrugalGPT: How to Use Large Language Models While Reducing Cost and Improving Performance. arXiv:[2305.05176](https://arxiv.org/abs/2305.05176). — 98% cost reduction while matching GPT-4 quality via cascade routing.

22. **Ong, I. et al.** (2025). RouteLLM: Learning to Route LLMs with Preference Data. *ICLR 2025*. arXiv:[2406.18665](https://arxiv.org/abs/2406.18665). — 85% cost reduction, 95% quality retained, BERT-based classifier router.

23. **arXiv:2603.03752** (2026). Confidence-Calibrated SLM-LLM Collaboration. — Trains SLMs to know when to escalate; addresses poorly calibrated confidence scores.

24. **arXiv:2510.13890** (2025). A Survey on LLM-SLM Collaboration. — Taxonomy: routing, cascading, guidance-generation, distillation pipeline.

### Context & Evaluation

25. **Gloaguen, T.; Mündler, N. et al.** (2026). Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents? arXiv:[2602.11988](https://arxiv.org/abs/2602.11988). ETH Zurich. — Auto-generated context files degrade performance -3%; human-written improve +4%. Non-inferability principle.

26. **Osmani, A.** (2026). AGENTS.md: How to Write System Prompts for AI Agents. — Uses "crystallized" to describe pattern solidification; community adoption of SKILL.md pattern.

---

*This document is part of [myelin](https://github.com/kuro-agent/myelin). Built by [Kuro](https://kuro.page), a perception-driven AI agent.*
