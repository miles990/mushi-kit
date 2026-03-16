# Theoretical Foundation

myelin automates the crystallization of LLM decisions into deterministic rules. This document traces the theoretical roots, explains the system logic, and positions myelin relative to academic work.

## The Problem: Repeated Expensive Inference

Every LLM API call costs tokens, time, and reliability. Production systems make the same types of decisions thousands of times — triage, classification, routing. If an LLM returns the same answer 100 times with 95%+ consistency for structurally similar inputs, that decision doesn't need an LLM anymore.

**myelin makes the LLM unnecessary for known patterns.** Novel inputs still go to the LLM. But the LLM's job shrinks over time as more patterns crystallize into free, instant, deterministic rules.

## Theoretical Roots

### Crystallized Intelligence (Cattell, 1943)

Raymond Cattell distinguished two types of intelligence:

- **Fluid intelligence (Gf)**: Flexible reasoning applied to novel problems
- **Crystallized intelligence (Gc)**: Accumulated knowledge and established patterns

His "Investment Theory" proposes that fluid intelligence *invests* into crystallized intelligence through experience — flexible reasoning solidifies into reliable, reusable knowledge over time.

**Relationship to myelin**: LLM inference = fluid intelligence (expensive, flexible, probabilistic). Crystallized rules = crystallized intelligence (free, reliable, deterministic). myelin automates the investment process — every LLM decision is a potential investment that may solidify into a permanent rule.

> Cattell, R. B. (1943). "The measurement of adult intelligence." *Psychological Bulletin*, 40(3), 153–193.

### SECI Model — Knowledge Externalization (Nonaka, 1994)

Nonaka's organizational knowledge creation model defines four modes of knowledge conversion. The critical one for myelin is **Externalization** — converting tacit knowledge into explicit knowledge. Nonaka explicitly uses the word "crystallized" to describe this step: implicit patterns become explicit, shareable, reusable forms.

| SECI Mode | Knowledge Flow | myelin Equivalent |
|-----------|---------------|-------------------|
| Socialization | Tacit → Tacit | LLM observing event patterns |
| **Externalization** | **Tacit → Explicit** | **Crystallizer extracting rules from decision logs** |
| Combination | Explicit → Explicit | Rules composing with other rules |
| Internalization | Explicit → Tacit | Rules becoming "infrastructure" (invisible, always-on) |

> Nonaka, I. (1994). "A Dynamic Theory of Organizational Knowledge Creation." *Organization Science*, 5(1), 14–37.

### Nurture-First Agent Development (Wang et al., 2026)

The most directly related academic work. Defines a four-stage **Knowledge Crystallization Cycle**:

1. **Conversational Immersion** — Agent operates in environment, generating decisions
2. **Experience Accumulation** — Decisions logged with context and outcomes
3. **Deliberate Crystallization** — Patterns extracted and formalized into reusable knowledge
4. **Grounded Application** — Crystallized knowledge applied to reduce future inference cost

Three-layer cognitive architecture:
- **Constitutional Layer** (low volatility) — Core rules, always loaded
- **Skill Layer** (medium volatility) — Crystallized knowledge, loaded on demand
- **Experiential Layer** (high volatility) — Raw interaction data, searched semantically

Validation: Financial research agent improved useful analysis rate from 38% → 74% over 12 weeks.

**Relationship to myelin**: myelin implements stages 2–4 as middleware. The telemetry system handles accumulation (`telemetry.ts`), the crystallizer handles deliberate crystallization (`crystallizer.ts`), and the rule engine handles grounded application (`rules.ts`). The key difference: myelin operates at the **API call level** (intercepting LLM requests), not at the agent-conversation level. This makes it framework-agnostic — any system that calls an LLM can use myelin.

> "Nurture-First Agent Development: Conversational Knowledge Crystallization." arXiv:2603.10808, March 2026.

### Theory of Agent — Epistemic Effort Conservation (Wang et al., 2026)

Proposes that agent systems should only invoke expensive inference when "epistemically necessary." Over-delegation to powerful models actively suppresses capability growth. The total epistemic effort is conserved: E = E_internal + E_external.

**Relationship to myelin**: myelin's crystallization reduces E_external (LLM calls) by converting repeated decisions into E_internal (rules). This isn't just cost optimization — it's epistemically aligned behavior. The system learns to handle known patterns internally, reserving external LLM calls for genuinely novel situations.

> "Theory of Agent." arXiv:2506.00886, 2026.

### Trajectory-Informed Memory Generation (IBM Research, 2026)

Extracts three types of crystallized knowledge from execution trajectories: Strategy Tips (approach patterns), Recovery Tips (error recovery), and Optimization Tips (efficiency improvements). Result: +28.5% task completion rate.

**Relationship to myelin**: Similar extraction-from-trajectories approach, but myelin focuses on **decision classification patterns** rather than execution strategies. Both validate the core idea: LLM execution traces contain learnable structure that can be reused.

> "Trajectory-Informed Memory Generation." arXiv:2603.10600, IBM Research, March 2026.

## How myelin Reduces Token Cost

### The Crystallization Pipeline

```
LLM Call → Telemetry Log → Pattern Mining → Rule Promotion → Deterministic Execution
     $$$        (accumulate)    (crystallize)    (promote)         $0, 0ms
```

1. **Observe**: Every LLM decision is logged with full context — input event, output action, confidence, latency, tokens consumed (`telemetry.ts`)
2. **Accumulate**: Telemetry builds a corpus of decision patterns. Each decision is fingerprinted by structural features (event type, source, context key shapes) rather than exact values (`crystallizer.ts:eventFingerprint()`)
3. **Crystallize**: Pattern mining identifies clusters where the LLM consistently returns the same action for structurally similar inputs. Candidates must exceed both occurrence and consistency thresholds (`getCandidates()`)
4. **Promote**: Validated patterns become deterministic rules — match conditions (regex, keyword, exact match) paired with fixed actions (`rules.ts`)
5. **Apply**: On each new input, the rule engine checks for matches **before** calling the LLM. Match → instant result. No match → LLM handles it, logs for future crystallization

### The Economics

| | Before myelin | After myelin |
|---|---|---|
| Known pattern | LLM call (~500 tokens, ~800ms) | Rule match (0 tokens, <1ms) |
| Novel input | LLM call (~500 tokens, ~800ms) | LLM call (~500 tokens, ~800ms) |
| Cost trajectory | **Linear** with volume | **Decreasing** over time |
| Reliability | ~95% (LLM may vary) | 100% deterministic for known patterns |

As more patterns crystallize, the cost curve bends:
- More rules → fewer LLM calls → lower cost per decision
- More data → better patterns → more rules → even fewer LLM calls
- **Positive feedback loop** until diminishing returns (only genuinely novel inputs remain)

### Production Data

From a production AI agent running 24/7 (mini-agent, Feb 28 – Mar 15, 2026):

| Metric | Day 1 | Day 7 | Day 17 |
|--------|-------|-------|--------|
| Rule coverage | 22% | 48% | 100% |
| LLM triage calls/day | ~80 | ~13 | 0 |
| Avg latency | ~800ms | ~12ms | <1ms |

Rule layer growth was not engineered — no one set "reach 100% rule coverage" as a goal. It emerged from the positive feedback loop: LLM decisions → pattern recognition → rule promotion → LLM handles fewer cases → remaining cases crystallize → convergence.

## System Logic: How LLM Drives Its Own Replacement

### Core Principle

**Observation → Pattern → Rule → Bypass.**

myelin doesn't make LLM calls cheaper. It **eliminates** them for known patterns.

### The Crystallizer Algorithm

The crystallizer (`crystallizer.ts`) uses structural fingerprinting to group similar decisions:

1. **Fingerprint**: Each decision is fingerprinted by event type + source + context key shapes (not values). Two events with the same fingerprint are "the same kind of event"
2. **Group**: Decisions with identical fingerprints are clustered
3. **Evaluate**: For each cluster, check: (a) enough occurrences? (b) consistent action across occurrences?
4. **Extract rule match**: From the cluster's common structural features, generate a `RuleMatch` — the conditions under which this rule fires
5. **Promote**: The candidate becomes a `Rule` with the consistent action, a generated ID, and a hit counter

```typescript
// Simplified flow
const candidates = myelin.getCandidates({
  minOccurrences: 10,    // seen it enough times
  minConsistency: 0.95,  // LLM agreed 95%+ of the time
});
// Each candidate: { fingerprint, action, count, consistency, suggestedMatch }

myelin.crystallize(candidates[0]);
// Now a permanent rule — no LLM needed for this pattern
```

### Why This Works: Confidence Gate Theory

Doku (arXiv:2603.09947, 2026) proved that a confidence-based gate's selective accuracy improves monotonically **if and only if** there are no "inversion zones" (the C2 condition). myelin's triage operates on **structural uncertainty** (event type, source, temporal patterns) — a domain where C2 naturally holds. This explains why production data shows zero false negatives over 3,560+ decisions: the problem structure is right for gating.

> Doku. "Confidence Gate Theorem." arXiv:2603.09947, March 2026.

### Self-Improving Economics

Each crystallization cycle makes the system cheaper to run:

```
Week 1:  LLM handles 78% of decisions (rules: 22%)
Week 2:  LLM handles 3.3% of decisions (rules: 96.7%)
Week 3:  LLM handles 0% of decisions (rules: 100%)
```

The crystallization process itself uses LLM tokens (when the LLM handles novel cases), but this is a **one-time investment** that pays dividends on every future matching request. The ROI improves with volume.

## Where Small Models Excel

### The Classification Insight

Most production LLM decisions are **classification**, not **generation**:
- Is this message urgent? (binary)
- What category does this belong to? (multi-class)
- Should this be escalated? (binary)
- Which model should handle this? (routing)

These tasks need **pattern recognition**, not **reasoning**. A model that has seen enough examples will outperform a larger model reasoning from first principles.

### Empirical Evidence

**Li et al. (ACL 2025 Industry Track, arXiv:2505.16078)** — "Small Language Models in the Real World":
- Fine-tuned **1B model beats 70B zero-shot** for binary classification (F1: 0.865 vs 0.800)
- Performance bottleneck is **data quantity and domain knowledge**, not model size
- Chain-of-Thought (CoT) **hurts** small model performance — overthinking simple decisions degrades accuracy
- ModernBERT (149M params) needs only **1.72GB RAM** vs Llama-1B's 25.78GB — **15x more efficient**

> Li et al. "Small Language Models in the Real World." ACL 2025 Industry Track, arXiv:2505.16078.

**Carroll, Korbak et al. (arXiv:2603.05706, 2026)** — "Reasoning Models Struggle to Control their Chains of Thought":
- Larger reasoning models have **lower** Chain-of-Thought controllability
- Small models used for triage are inherently more **transparent and auditable** — their decision paths are shorter and more monitorable
- This is a safety property: the System 1 layer (triage) should be simple enough to inspect

> Carroll, Korbak et al. arXiv:2603.05706, March 2026.

**Johnson (arXiv:2603.12129, 2026)** — "Increasing Intelligence Can Worsen Collective Outcomes":
- When resources are scarce (C/N < 0.5), **simpler models outperform smarter ones**
- Model-size inversion is real and predictable based on environmental conditions
- For triage (a resource-allocation decision under token budget scarcity), using the smallest adequate model is mathematically optimal

> Johnson. arXiv:2603.12129, March 2026.

### myelin's Position on the Capability Spectrum

```
Regex/Rules  ←——————→  Small Model  ←——————→  Large Model
(free, rigid)          (cheap, learned)       (expensive, flexible)

         myelin crystallizes LEFT ←——— from RIGHT
```

1. Start with a **large model** making flexible but expensive decisions
2. Observe patterns → crystallize into **deterministic rules** (free, instant)
3. For patterns too complex for regex → future path: crystallize into a **fine-tuned small classifier**
4. The LLM only handles **genuinely novel, ambiguous inputs**

The endgame isn't "no LLM." It's **LLM only where LLM is necessary.**

### Why Small Models Are Better for Triage Specifically

| Property | Small Model (≤9B) | Large Model (≥70B) |
|----------|-------------------|--------------------|
| Binary classification | Equal or better (Li et al.) | Overthinks with CoT |
| Latency | <200ms | 500–2000ms |
| Cost | ~$0 (local) or $0.0001/call | $0.005–0.01/call |
| Auditability | Short decision paths | Opaque reasoning chains |
| CoT controllability | Higher (Carroll et al.) | Lower — more RL = less control |
| Resource scarcity perf | Better when C/N < 0.5 (Johnson) | Worse — intelligence backfires |

For the specific task of "should this input go to the LLM?" — a small model (or a crystallized rule) is not just cheaper, it's **better**.

## Related Work

### Direct Predecessors

| Work | What It Does | How myelin Differs |
|------|-------------|-------------------|
| **NFD** (arXiv:2603.10808) | 4-stage knowledge crystallization cycle for agents | myelin implements stages 2–4 as **framework-agnostic middleware** |
| **DPT-Agent** (ACL 2025, arXiv:2502.11882) | Dual-process: FSM (S1) + LLM (S2) for game agents | myelin is a **gate** (S1 decides if S2 runs), not concurrent dual-process |
| **RouteLLM** (ICLR 2025) | Query-level binary routing between two models | myelin operates **upstream** — decides if any model should run at all |
| **A-MEM** (NeurIPS 2025, arXiv:2502.12110) | Zettelkasten-inspired dynamic memory for agents | Complementary: A-MEM manages what agents remember, myelin manages what they compute |
| **SAGE** (Alibaba) | RL training to reduce token usage ~59% | Requires 32×H100 for training; myelin needs zero training |

### The Naming Gap

The word "crystallization" in the AI/LLM context is essentially unclaimed:
- No npm package, no framework, no product uses "crystallization" for pattern-to-rule conversion
- OpenAI community has one post (danieljmueller, Sep 2024) proposing "Abstraction-Crystallization Step" — zero engagement
- Practitioners describe the same process with different words: "persist," "consolidate," "distill," "hoard" (Willison)
- The SKILL.md pattern (Claude Code, Cursor, Copilot, Gemini CLI) is **manual crystallization** — developers hand-writing rules from observed LLM behavior

myelin automates what developers are already doing manually.

## The Biological Analogy

The name "myelin" comes from the biological myelination process: repeated neural signals cause myelin sheaths to form around axons, increasing transmission speed 100×. The signal doesn't change — the pathway becomes faster.

This maps precisely to the crystallization pipeline:

| Biology | myelin |
|---------|--------|
| Novel stimulus → slow neural processing | Novel input → LLM inference (~800ms) |
| Repeated stimulus → myelination | Repeated pattern → rule crystallization |
| Myelinated signal → 100× faster | Rule match → instant (0ms) |
| Demyelination on disuse | Rule deprecation on drift |

The same pattern appears across domains:

- **Immune system**: Adaptive response → memory B cells → innate-like rapid response
- **Law**: Case-by-case judgments → precedent → statute
- **Software engineering**: Manual debugging → automated tests → CI/CD rules
- **Cognitive science**: Explicit learning (System 2) → procedural memory (System 1)

**Intelligence is expensive. Crystallized intelligence is free.**
