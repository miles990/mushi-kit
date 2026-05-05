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
import type { Template, Methodology, Rule } from './types.ts';
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
export declare function extractMethodology<A extends string>(templates: Template<A>[], rules: Rule<A>[]): Methodology;
/**
 * Format a methodology as human-readable text.
 * Useful for including in LLM prompts (closed loop) or documentation.
 */
export declare function formatMethodology(methodology: Methodology): string;
//# sourceMappingURL=methodology.d.ts.map