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
/**
 * Create a hierarchical crystallization stack.
 */
export function createStack(config) {
    const layers = config.layers;
    let lastMethodologies = new Array(layers.length).fill(undefined);
    return {
        layer(index) {
            return layers[index];
        },
        depth() {
            return layers.length;
        },
        distill() {
            const results = [];
            const crossLayerEvents = [];
            for (let i = 0; i < layers.length; i++) {
                const result = layers[i].distill();
                results.push(result);
                // If there's a next layer, feed methodology as observation
                if (i < layers.length - 1 && result.methodology.principles.length > 0) {
                    const nextLayer = layers[i + 1];
                    nextLayer.observe({
                        type: 'layer_distill',
                        source: `layer_${i}`,
                        context: {
                            principles: result.methodology.principles.length,
                            dimensions: result.methodology.dimensions.length,
                            ruleCount: result.rules.length,
                            templateCount: result.templates.length,
                        },
                    }, { methodologyText: result.methodologyText });
                }
            }
            return { layers: results, crossLayerEvents };
        },
        evolve() {
            const results = [];
            const crossLayerEvents = [];
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
                    layers[i + 1].observe({
                        type: 'layer_evolution',
                        source: `layer_${i}`,
                        context: {
                            events: evolutionResult.events.length,
                            guidance: evolutionResult.guidance.length > 0,
                        },
                    }, { events: evolutionResult.events });
                }
            }
            return { layers: results, crossLayerEvents };
        },
    };
}
//# sourceMappingURL=stack.js.map