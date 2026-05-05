/**
 * myelin — Fleet
 *
 * Manages multiple myelin instances with shared observation.
 * Use when your system has multiple decision domains
 * (e.g. triage, routing, learning) each with their own crystallization.
 */
/**
 * Create a fleet that manages multiple myelin instances.
 */
export function createFleet(members) {
    const fleet = new Map();
    if (members) {
        for (const m of members) {
            fleet.set(m.name, m.instance);
        }
    }
    return {
        get(name) {
            return fleet.get(name);
        },
        add(config) {
            fleet.set(config.name, config.instance);
        },
        remove(name) {
            return fleet.delete(name);
        },
        stats() {
            const memberStats = [...fleet.entries()].map(([name, instance]) => ({
                name,
                stats: instance.stats(),
            }));
            const totalRules = memberStats.reduce((sum, m) => sum + m.stats.ruleCount, 0);
            const totalDecisions = memberStats.reduce((sum, m) => sum + m.stats.totalDecisions, 0);
            const totalRuleDecisions = memberStats.reduce((sum, m) => sum + m.stats.ruleDecisions, 0);
            return {
                members: memberStats,
                totalRules,
                totalDecisions,
                overallRuleCoverage: totalDecisions > 0 ? (totalRuleDecisions / totalDecisions) * 100 : 0,
            };
        },
        names() {
            return [...fleet.keys()];
        },
        observeAll(event, metadata) {
            for (const instance of fleet.values()) {
                instance.observe(event, metadata);
            }
        },
        distillAll() {
            for (const instance of fleet.values()) {
                instance.distill();
            }
        },
        async triageWith(name, event) {
            const instance = fleet.get(name);
            if (!instance)
                return null;
            return instance.triageSafe(event);
        },
    };
}
//# sourceMappingURL=fleet.js.map