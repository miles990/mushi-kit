# myelin Launch Strategy

## Dev.to Article
- File: `docs/devto-article.md` (draft ready)
- Tags: #ai #typescript #opensource #machinelearning
- Status: **Draft complete, pending Alex review**

## Show HN Plan

### Title (choose one)
1. `Show HN: Myelin – Crystallize repeated LLM decisions into zero-cost rules`
2. `Show HN: Myelin – My AI agent eliminated its own LLM calls in 17 days`
3. `Show HN: Myelin – Stop paying your LLM to make the same decision twice`

### Timing
- **Primary**: Tuesday or Wednesday, 6-8 AM EST (11:00-13:00 UTC)
- **Alternative**: Saturday ~12:00 UTC (lower competition, more dwell time)
- Block 2-3 hours after posting to respond to every comment

### First Comment (post within 60 seconds)
Template:
> I built this after watching my AI agent's logs. It triages ~400 notifications/day, and after two weeks, 95% of its LLM calls were returning the same answer for the same patterns.
>
> myelin watches your LLM's outputs, finds patterns that are stable (10+ occurrences, 95%+ consistency), and promotes them to deterministic rules. The LLM only handles genuinely novel inputs.
>
> Key differences from semantic caching:
> - Cache stores exact responses. myelin learns *patterns* that generalize across similar inputs.
> - Rules are inspectable, editable JSON — you can review them in a PR.
> - Conservative by default: human-in-the-loop crystallization. A wrong rule is worse than no rule.
>
> In production: 3,560+ decisions, 100% rule coverage in 17 days, zero false negatives.
>
> ~400 lines of TypeScript, zero dependencies. Would love feedback on the API design and crystallization heuristics.

### Anticipated Objections & Responses

**"Why not just write the rules yourself?"**
→ You could, but you'd need to audit thousands of LLM decisions to find the patterns first. myelin does the auditing automatically. In my case it found 47+ distinct patterns that I wouldn't have codified manually.

**"How is this different from GPTCache / semantic caching?"**
→ Cache = stores exact responses (string match). myelin = learns patterns that generalize (structural match). "dependabot: bump axios" and "dependabot: bump lodash" are cache misses but the same rule match. Also: rules are inspectable JSON, not opaque embeddings.

**"What about concept drift / edge cases?"**
→ Conservative crystallization (95%+ consistency threshold). Fail-open by default — unknown inputs always go to the LLM. Rules can be removed/edited. The JSONL log provides full audit trail.

**"Isn't this just a lookup table?"**
→ Yes, eventually. That's the point. The insight is that most LLM classification tasks converge to a lookup table — myelin just makes that convergence automatic and safe.

### Key Data Points to Emphasize
- 3,560+ decisions in production
- 17 days to 100% rule coverage
- Zero false negatives
- ~400 lines, zero dependencies
- Works with any LLM (OpenAI, Claude, Ollama, local)

### Critical Warning (from research)
AI-related Show HN posts **underperform expectations** after clearing 10 points (State of Show HN 2025). The market is saturated with shallow AI content. Our edge: **real production data + working code + novel framing (eliminate > cache)**.

## Coordinated Launch Sequence
1. ✅ README polished with real data
2. ✅ User testing complete (56/56 tests)
3. ⬜ npm publish (HOLD — Alex decision pending)
4. ⬜ Dev.to article published
5. ⬜ Show HN posted (same day or next day after Dev.to)
6. ⬜ Tweet thread from @Kuro938658

## Competitive Positioning
Our article fills gaps that NO existing content covers:
- Only one with real before/after production data
- Only one naming the "Eliminate > Cache > Optimize" hierarchy
- Only one showing the rule discovery (crystallization) process
- Only developer-first "I built this" narrative (vs enterprise whitepapers)

## Sources
- [Markepear: How to launch on HN](https://www.markepear.dev/blog/dev-tool-hacker-news-launch)
- [Lucas Costa: Successful HN launch](https://www.lucasfcosta.com/blog/hn-launch)
- [Sturdy Statistics: State of Show HN 2025](https://blog.sturdystatistics.com/posts/show_hn/)
- [Best time to post analysis (23k posts)](https://news.ycombinator.com/item?id=44569046)
