/**
 * myelin — Stack
 *
 * Hierarchical crystallization pipeline.
 * Chains multiple myelin instances where each layer
 * feeds its distilled output to the next.
 *
 * L1 (specific rules) → L2 (templates) → L3 (methodology)
 * Each layer can be a separate myelin instance with its own rules.
 */
import type { Myelin, MyelinStackConfig, StackDistillResult, DefaultAction } from './types.ts';
export interface MyelinStack<A extends string = DefaultAction> {
    /** Get a layer by index (0-based) */
    layer: (index: number) => Myelin<A> | undefined;
    /** Number of layers */
    depth: () => number;
    /** Distill all layers bottom-up, feeding each layer's output to the next */
    distill: () => StackDistillResult<A>;
    /** Evolve all layers and detect cross-layer changes */
    evolve: () => StackDistillResult<A>;
}
/**
 * Create a hierarchical crystallization stack.
 */
export declare function createStack<A extends string = DefaultAction>(config: MyelinStackConfig<A>): MyelinStack<A>;
//# sourceMappingURL=stack.d.ts.map