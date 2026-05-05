/**
 * myelin — Rule Engine
 *
 * Matches events against crystallized rules.
 * Rules are deterministic, instant (0ms), and zero-cost.
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
let ruleIdCounter = 0;
/** Generate a unique rule ID */
export function generateRuleId() {
    return `rule_${Date.now()}_${++ruleIdCounter}`;
}
/** Check if a single condition matches a value */
function matchCondition(condition, value) {
    // Exact match for primitives
    if (typeof condition === 'string' || typeof condition === 'number' || typeof condition === 'boolean') {
        return value === condition;
    }
    // Regex pattern match
    if (typeof condition === 'object' && condition !== null && 'pattern' in condition) {
        return typeof value === 'string' && new RegExp(condition.pattern).test(value);
    }
    // Array condition matches — value must be an array
    if (typeof condition === 'object' && condition !== null && 'includes' in condition) {
        return Array.isArray(value) && value.includes(condition.includes);
    }
    if (typeof condition === 'object' && condition !== null && 'includesAny' in condition) {
        return Array.isArray(value) && condition.includesAny.some(v => value.includes(v));
    }
    if (typeof condition === 'object' && condition !== null && 'includesAll' in condition) {
        return Array.isArray(value) && condition.includesAll.every(v => value.includes(v));
    }
    // Numeric range match
    if (typeof value !== 'number')
        return false;
    const range = condition;
    if (range.lt != null && !(value < range.lt))
        return false;
    if (range.lte != null && !(value <= range.lte))
        return false;
    if (range.gt != null && !(value > range.gt))
        return false;
    if (range.gte != null && !(value >= range.gte))
        return false;
    return true;
}
/** Check if an event matches a rule's conditions */
export function matchRule(event, match) {
    // Match event type
    if (match.type != null) {
        if (match.type.startsWith('/') && match.type.endsWith('/')) {
            // Regex pattern
            const pattern = match.type.slice(1, -1);
            if (!new RegExp(pattern).test(event.type))
                return false;
        }
        else {
            // Exact match
            if (event.type !== match.type)
                return false;
        }
    }
    // Match source
    if (match.source != null) {
        if (!event.source)
            return false;
        if (match.source.startsWith('/') && match.source.endsWith('/')) {
            const pattern = match.source.slice(1, -1);
            if (!new RegExp(pattern).test(event.source))
                return false;
        }
        else {
            if (event.source !== match.source)
                return false;
        }
    }
    // Match context conditions
    if (match.context) {
        const ctx = event.context ?? {};
        for (const [key, condition] of Object.entries(match.context)) {
            if (!matchCondition(condition, ctx[key]))
                return false;
        }
    }
    return true;
}
/** Find the first matching rule for an event */
export function findMatchingRule(event, rules) {
    for (const rule of rules) {
        if (matchRule(event, rule.match)) {
            return rule;
        }
    }
    return null;
}
/** Load rules from a JSON file */
export function loadRules(path) {
    if (!existsSync(path))
        return [];
    try {
        const data = readFileSync(path, 'utf-8');
        const parsed = JSON.parse(data);
        return Array.isArray(parsed) ? parsed : [];
    }
    catch {
        return [];
    }
}
/** Save rules to a JSON file */
export function saveRules(path, rules) {
    const dir = dirname(path);
    if (!existsSync(dir))
        mkdirSync(dir, { recursive: true });
    writeFileSync(path, JSON.stringify(rules, null, 2), 'utf-8');
}
//# sourceMappingURL=rules.js.map