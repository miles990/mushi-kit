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

import type {
  Myelin,
  MyelinStackConfig,
  StackDistillResult,
  EvolutionEvent,
  DefaultAction,
  Methodology,
} from './types.ts';

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
export function createStack<A extends string = DefaultAction>(
  config: MyelinStackConfig<A>,
): MyelinStack<A> {
  const layers = config.layers;
  let lastMethodologies: (Methodology | undefined)[] = new Array(layers.length).fill(undefined);

  return {
    layer(index: number) {
      return layers[index];
    },

    depth() {
      return layers.length;
    },

    distill(): StackDistillResult<A> {
      const results = [];
      const crossLayerEvents: EvolutionEvent[] = [];

      for (let i = 0; i < layers.length; i++) {
        const result = layers[i].distill();
        results.push(result);

        // If there's a next layer, feed methodology as observation
        if (i < layers.length - 1 && result.methodology.principles.length > 0) {
          const nextLayer = layers[i + 1];
          nextLayer.observe(
            {
              type: 'layer_distill',
              source: `layer_${i}`,
              context: {
                principles: result.methodology.principles.length,
                dimensions: result.methodology.dimensions.length,
                ruleCount: result.rules.length,
                templateCount: result.templates.length,
              },
            },
            { methodologyText: result.methodologyText },
          );
        }
      }

      return { layers: results, crossLayerEvents };
    },

    evolve(): StackDistillResult<A> {
      const results = [];
      const crossLayerEvents: EvolutionEvent[] = [];

      for (let i = 0; i < layers.length; i++) {
        const evolutionResult = layers[i].evolve(lastMethodologies[i]);
        results.push(evolutionResult.distill);
        lastMethodologies[i] = evolutionResult.distill.methodology;

        // Collect cross-layer evolution events
        for (const event of evolutionResult.events) {
          crossLayerEvents.push({
            ...event,
            description: `[Layer ${i}] ${event.description}`,
          });
        }

        // Feed to next layer
        if (i < layers.length - 1 && evolutionResult.events.length > 0) {
          layers[i + 1].observe(
            {
              type: 'layer_evolution',
              source: `layer_${i}`,
              context: {
                events: evolutionResult.events.length,
                guidance: evolutionResult.guidance.length > 0,
              },
            },
            { events: evolutionResult.events },
          );
        }
      }

      return { layers: results, crossLayerEvents };
    },
  };
}
