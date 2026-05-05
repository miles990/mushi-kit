/**
 * myelin — Layer 3: Methodology
 *
 * Extracts decision dimensions and principles from templates.
 * This is the "crystallization of crystallizations" — meta²-learning.
 *
 * Layer 1: events → rules        (specific pattern-action pairs)
 * Layer 2: rules → templates     (abstract decision patterns)
 * Layer 3: templates → methodology (decision framework with dimensions + principles)
 *
 * The closed loop: methodology feeds back into Layer 1 by providing
 * dimension-aware context for future crystallization decisions.
 */
/**
 * Extract a methodology from templates.
 *
 * Algorithm:
 * 1. Collect all context keys across templates → candidate dimensions
 * 2. Weight dimensions by how many templates use them
 * 3. Classify dimension levels from observed values
 * 4. Extract principles: "when dimension X is level Y → action Z"
 * 5. Build decision matrix
 */
export function extractMethodology(templates, rules) {
    if (templates.length === 0) {
        return emptyMethodology();
    }
    const dimensions = extractDimensions(templates);
    const principles = extractPrinciples(templates, dimensions);
    const matrix = buildMatrix(templates, rules, dimensions);
    const totalRules = templates.reduce((sum, t) => sum + t.ruleCount, 0);
    const totalHits = templates.reduce((sum, t) => sum + t.totalHits, 0);
    return {
        dimensions,
        principles,
        matrix,
        templateCount: templates.length,
        ruleCount: totalRules,
        totalHits,
        generatedAt: new Date().toISOString(),
    };
}
function emptyMethodology() {
    return {
        dimensions: [],
        principles: [],
        matrix: [],
        templateCount: 0,
        ruleCount: 0,
        totalHits: 0,
        generatedAt: new Date().toISOString(),
    };
}
/**
 * Extract dimensions from templates.
 *
 * A "dimension" is a context key that appears across multiple templates.
 * The more templates use it, the higher its weight.
 */
function extractDimensions(templates) {
    // Collect all context keys and their types across templates
    const keyInfo = new Map();
    for (const template of templates) {
        for (const [key, type] of Object.entries(template.invariants.stableContext)) {
            const info = keyInfo.get(key) ?? { types: new Set(), templateCount: 0, templateIds: [] };
            info.types.add(type);
            info.templateCount++;
            info.templateIds.push(template.id);
            keyInfo.set(key, info);
        }
        // Also count variable keys — they indicate dimensions that vary
        for (const key of template.variables) {
            const info = keyInfo.get(key) ?? { types: new Set(), templateCount: 0, templateIds: [] };
            info.types.add('variable');
            info.templateCount++;
            info.templateIds.push(template.id);
            keyInfo.set(key, info);
        }
    }
    const dimensions = [];
    for (const [key, info] of keyInfo) {
        const weight = info.templateCount / templates.length;
        // Classify levels based on condition type
        const levels = deriveLevels(info.types);
        const description = deriveDescription(key, info.types);
        dimensions.push({
            name: key,
            description,
            indicators: [key],
            levels,
            weight,
        });
    }
    // Sort by weight (most important first)
    return dimensions.sort((a, b) => b.weight - a.weight);
}
/** Derive human-readable levels for a dimension based on its condition types */
function deriveLevels(types) {
    if (types.has('boolean')) {
        return ['true', 'false'];
    }
    if (types.has('numeric_range')) {
        return ['low', 'medium', 'high'];
    }
    if (types.has('exact_string')) {
        return ['specific', 'any'];
    }
    if (types.has('pattern')) {
        return ['matches', 'no_match'];
    }
    return ['present', 'absent'];
}
/** Generate a description for a dimension */
function deriveDescription(key, types) {
    const typeName = types.has('boolean') ? 'flag'
        : types.has('numeric_range') ? 'scale'
            : types.has('exact_string') ? 'category'
                : types.has('pattern') ? 'pattern'
                    : 'indicator';
    return `${typeName}: ${key}`;
}
/**
 * Extract principles from templates.
 *
 * A principle is: "When [conditions], then [action]"
 * Derived by grouping templates by action and finding common dimensions.
 */
function extractPrinciples(templates, dimensions) {
    // Group templates by action
    const byAction = new Map();
    for (const template of templates) {
        const group = byAction.get(template.action) ?? [];
        group.push(template);
        byAction.set(template.action, group);
    }
    const principles = [];
    for (const [action, actionTemplates] of byAction) {
        // Find dimensions that are common across templates for this action
        const commonDimensions = findCommonDimensions(actionTemplates, dimensions);
        if (commonDimensions.length > 0) {
            const whenParts = commonDimensions.map(d => {
                const condType = getCommonConditionType(actionTemplates, d.name);
                return `${d.name} is ${condType}`;
            });
            principles.push({
                description: `${action} when ${whenParts.join(' and ')}`,
                when: whenParts.join(' AND '),
                then: action,
                confidence: computeConfidence(actionTemplates, templates),
                supportingTemplates: actionTemplates.map(t => t.id),
            });
        }
        else {
            // No common dimensions — principle is just about the action
            principles.push({
                description: `${action} for ${actionTemplates.length} pattern group(s)`,
                when: actionTemplates.map(t => t.name).join('; '),
                then: action,
                confidence: computeConfidence(actionTemplates, templates),
                supportingTemplates: actionTemplates.map(t => t.id),
            });
        }
    }
    // Sort by confidence
    return principles.sort((a, b) => b.confidence - a.confidence);
}
/** Find dimensions present in ALL templates of a group */
function findCommonDimensions(templates, allDimensions) {
    return allDimensions.filter(dim => {
        return templates.every(t => {
            const inStable = dim.name in t.invariants.stableContext;
            const inVariables = t.variables.includes(dim.name);
            return inStable || inVariables;
        });
    });
}
/** Get the most common condition type for a dimension across templates */
function getCommonConditionType(templates, dimensionName) {
    const types = new Map();
    for (const template of templates) {
        const condType = template.invariants.stableContext[dimensionName];
        if (condType) {
            types.set(condType, (types.get(condType) ?? 0) + 1);
        }
    }
    if (types.size === 0)
        return 'present';
    // Return most common type
    let best = 'present';
    let bestCount = 0;
    for (const [type, count] of types) {
        if (count > bestCount) {
            best = type;
            bestCount = count;
        }
    }
    // Make it human-readable
    switch (best) {
        case 'boolean': return 'a flag (true/false)';
        case 'numeric_range': return 'within a range';
        case 'exact_string': return 'a specific value';
        case 'pattern': return 'matching a pattern';
        default: return best;
    }
}
/** Compute confidence for a set of templates relative to all templates */
function computeConfidence(actionTemplates, allTemplates) {
    const actionHits = actionTemplates.reduce((sum, t) => sum + t.totalHits, 0);
    const totalHits = allTemplates.reduce((sum, t) => sum + t.totalHits, 0);
    if (totalHits === 0) {
        return actionTemplates.length / allTemplates.length;
    }
    return actionHits / totalHits;
}
/**
 * Build a decision matrix from templates and rules.
 *
 * Each cell represents a unique combination of dimension values → action.
 */
function buildMatrix(templates, rules, dimensions) {
    if (dimensions.length === 0)
        return [];
    // Use top 3 dimensions max (to keep matrix manageable)
    const topDimensions = dimensions.slice(0, 3);
    // For each template, map its dimensions to levels
    const cells = new Map();
    for (const template of templates) {
        const conditions = {};
        for (const dim of topDimensions) {
            const condType = template.invariants.stableContext[dim.name];
            if (condType) {
                conditions[dim.name] = condType;
            }
            else if (template.variables.includes(dim.name)) {
                conditions[dim.name] = 'variable';
            }
            else {
                conditions[dim.name] = 'absent';
            }
        }
        const cellKey = JSON.stringify(conditions) + '→' + template.action;
        const existing = cells.get(cellKey);
        if (existing) {
            existing.support += template.totalHits;
            existing.confidence = Math.max(existing.confidence, template.ruleCount / rules.length);
        }
        else {
            cells.set(cellKey, {
                conditions,
                action: template.action,
                confidence: template.ruleCount / Math.max(rules.length, 1),
                support: template.totalHits,
            });
        }
    }
    return [...cells.values()].sort((a, b) => b.support - a.support);
}
/**
 * Format a methodology as human-readable text.
 * Useful for including in LLM prompts (closed loop) or documentation.
 */
export function formatMethodology(methodology) {
    const lines = [];
    lines.push('# Decision Methodology');
    lines.push('');
    lines.push(`Based on ${methodology.ruleCount} rules across ${methodology.templateCount} templates (${methodology.totalHits} total decisions).`);
    lines.push('');
    if (methodology.dimensions.length > 0) {
        lines.push('## Dimensions');
        lines.push('');
        for (const dim of methodology.dimensions) {
            lines.push(`- **${dim.name}** (weight: ${(dim.weight * 100).toFixed(0)}%) — ${dim.description}`);
            lines.push(`  Levels: ${dim.levels.join(', ')}`);
        }
        lines.push('');
    }
    if (methodology.principles.length > 0) {
        lines.push('## Principles');
        lines.push('');
        for (const p of methodology.principles) {
            lines.push(`- **${p.then}** when ${p.when} (confidence: ${(p.confidence * 100).toFixed(0)}%)`);
        }
        lines.push('');
    }
    if (methodology.matrix.length > 0) {
        lines.push('## Decision Matrix');
        lines.push('');
        for (const cell of methodology.matrix) {
            const conds = Object.entries(cell.conditions)
                .map(([k, v]) => `${k}=${v}`)
                .join(', ');
            lines.push(`- ${conds} → **${cell.action}** (${cell.support} decisions, ${(cell.confidence * 100).toFixed(0)}% confidence)`);
        }
        lines.push('');
    }
    return lines.join('\n');
}
//# sourceMappingURL=methodology.js.map