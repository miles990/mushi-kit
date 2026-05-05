/**
 * myelin — Feedback Loop (Closed-Loop Mechanics)
 *
 * The missing piece that connects the three layers into a self-reinforcing cycle:
 *
 * Layer 1 (rules) → Layer 2 (templates) → Layer 3 (methodology)
 *    ↑                    ↑                    ↓
 *    └── accelerated      └── compression      └── guidance + threshold adjustment
 *        crystallization      (N rules → 1)
 *
 * The loop: more decisions → more rules → templates emerge → methodology crystallizes
 * → methodology lowers thresholds for aligned patterns → faster crystallization
 * → fewer LLM calls → remaining calls are novel → new rules → updated methodology
 */
import { mergeTemplateToRuleFromRules } from "./templates.js";
/**
 * Score how well a crystallization candidate aligns with existing methodology.
 *
 * A candidate that fits an existing principle is more trustworthy —
 * it's not a new pattern, it's a variation of a known pattern.
 *
 * Returns 0 (no alignment) to 1 (perfect alignment).
 */
export function scoreAlignment(candidate, methodology) {
    if (methodology.principles.length === 0)
        return 0;
    let bestScore = 0;
    for (const principle of methodology.principles) {
        let score = 0;
        // Action match is the strongest signal
        if (principle.then === candidate.suggestedAction) {
            score += 0.6;
        }
        // Check if candidate's match conditions involve the same dimensions
        if (candidate.match.type && principle.when.includes(candidate.match.type)) {
            score += 0.2;
        }
        // Check if candidate's context keys overlap with principle's dimensions
        if (candidate.match.context) {
            const candidateKeys = Object.keys(candidate.match.context);
            const dimensionNames = methodology.dimensions.map(d => d.name);
            const overlap = candidateKeys.filter(k => dimensionNames.includes(k));
            if (overlap.length > 0) {
                score += 0.2 * (overlap.length / Math.max(candidateKeys.length, 1));
            }
        }
        bestScore = Math.max(bestScore, Math.min(score, 1));
    }
    return bestScore;
}
/**
 * Adjust crystallization thresholds based on methodology alignment.
 *
 * The key insight: if a candidate aligns with an existing principle,
 * it needs fewer observations to be trusted. The methodology has
 * already validated this type of decision.
 *
 * Alignment 0.0 → no adjustment (use base thresholds)
 * Alignment 0.5 → 25% reduction (e.g., 10 → 8 occurrences)
 * Alignment 1.0 → 50% reduction (e.g., 10 → 5 occurrences)
 *
 * minConsistency is never reduced — we always demand consistency.
 */
export function adjustedThreshold(alignment, baseMinOccurrences) {
    const reductionFactor = 1 - (alignment * 0.5); // 0.5 to 1.0
    return Math.max(3, Math.round(baseMinOccurrences * reductionFactor));
}
/**
 * Build LLM guidance text from methodology.
 *
 * This is the Layer 3 → Layer 1 feedback:
 * inject the methodology into the LLM's context so it makes
 * more consistent decisions from the start.
 *
 * Returns a string suitable for inclusion in an LLM system prompt.
 */
export function buildGuidance(methodology) {
    if (methodology.principles.length === 0 && methodology.dimensions.length === 0) {
        return '';
    }
    const lines = [
        'You have established decision patterns from prior observations:',
        '',
    ];
    // Dimensions first — frame the decision space
    if (methodology.dimensions.length > 0) {
        lines.push('Key decision factors:');
        for (const dim of methodology.dimensions.slice(0, 5)) {
            lines.push(`- ${dim.name}: ${dim.levels.join(' / ')}`);
        }
        lines.push('');
    }
    // Principles — the actual guidance
    if (methodology.principles.length > 0) {
        lines.push('Established principles:');
        for (const p of methodology.principles) {
            const conf = (p.confidence * 100).toFixed(0);
            lines.push(`- ${p.description} (${conf}% confidence)`);
        }
        lines.push('');
    }
    lines.push('Apply these patterns when they fit. For novel situations, reason independently.');
    return lines.join('\n');
}
/**
 * Compress rules using templates.
 *
 * When a template covers N rules with the same action and strong hit count,
 * replace those N rules with a single broader merged rule.
 *
 * This is Layer 2 → Layer 1 optimization: the rule table shrinks,
 * matching is faster, and the system is more general.
 */
export function optimizeRules(rules, templates, opts = {}) {
    const minTemplateHits = opts.minTemplateHits ?? 10;
    const minRuleCount = opts.minRuleCount ?? 3;
    const mergedRuleIds = [];
    const newMergedRules = [];
    const ruleIdsToRemove = new Set();
    // Only optimize templates with sufficient evidence
    const eligibleTemplates = templates.filter(t => t.totalHits >= minTemplateHits && t.ruleCount >= minRuleCount);
    for (const template of eligibleTemplates) {
        // Don't merge if any rule ID was already merged by a previous template
        if (template.ruleIds.some(id => ruleIdsToRemove.has(id)))
            continue;
        const mergedRule = mergeTemplateToRuleFromRules(template, rules);
        newMergedRules.push(mergedRule);
        for (const id of template.ruleIds) {
            ruleIdsToRemove.add(id);
            mergedRuleIds.push(id);
        }
    }
    // Build new rule set: remove merged rules, add broader rules
    const remainingRules = rules.filter(r => !ruleIdsToRemove.has(r.id));
    const optimizedRules = [...remainingRules, ...newMergedRules];
    return {
        rules: optimizedRules,
        mergedRuleIds,
        newMergedRules,
        compressionRatio: rules.length > 0 ? rules.length / optimizedRules.length : 1,
    };
}
/**
 * Detect evolution between two methodology snapshots.
 *
 * This is the system's self-awareness: it knows what it learned
 * and what it forgot between distillation cycles.
 */
export function detectEvolution(prev, next) {
    if (!prev) {
        // First distillation — everything is new
        const events = [];
        for (const dim of next.dimensions) {
            events.push({
                type: 'dimension_emerged',
                description: `New dimension: ${dim.name} (weight: ${(dim.weight * 100).toFixed(0)}%)`,
                details: { name: dim.name, weight: dim.weight },
            });
        }
        for (const p of next.principles) {
            events.push({
                type: 'principle_emerged',
                description: `New principle: ${p.description}`,
                details: { description: p.description, confidence: p.confidence },
            });
        }
        return events;
    }
    const events = [];
    // Detect new and retired dimensions
    const prevDimNames = new Set(prev.dimensions.map(d => d.name));
    const nextDimNames = new Set(next.dimensions.map(d => d.name));
    for (const dim of next.dimensions) {
        if (!prevDimNames.has(dim.name)) {
            events.push({
                type: 'dimension_emerged',
                description: `New dimension: ${dim.name} (weight: ${(dim.weight * 100).toFixed(0)}%)`,
                details: { name: dim.name, weight: dim.weight },
            });
        }
    }
    for (const dim of prev.dimensions) {
        if (!nextDimNames.has(dim.name)) {
            events.push({
                type: 'dimension_retired',
                description: `Retired dimension: ${dim.name}`,
                details: { name: dim.name },
            });
        }
    }
    // Detect new and retired principles
    const prevPrinciples = new Set(prev.principles.map(p => p.description));
    const nextPrinciples = new Set(next.principles.map(p => p.description));
    for (const p of next.principles) {
        if (!prevPrinciples.has(p.description)) {
            events.push({
                type: 'principle_emerged',
                description: `New principle: ${p.description}`,
                details: { description: p.description, confidence: p.confidence },
            });
        }
    }
    for (const p of prev.principles) {
        if (!nextPrinciples.has(p.description)) {
            events.push({
                type: 'principle_retired',
                description: `Retired principle: ${p.description}`,
                details: { description: p.description },
            });
        }
    }
    return events;
}
//# sourceMappingURL=feedback-loop.js.map