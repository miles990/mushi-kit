/**
 * myelin — Fleet
 *
 * Manages multiple myelin instances with shared observation.
 * Use when your system has multiple decision domains
 * (e.g. triage, routing, learning) each with their own crystallization.
 */

import type {
  Myelin,
  FleetMemberConfig,
  FleetStats,
  TriageEvent,
  TriageResult,
  DefaultAction,
} from './types.ts';

export interface MyelinFleet<A extends string = DefaultAction> {
  /** Get a named instance */
  get: (name: string) => Myelin<A> | undefined;
  /** Add a member to the fleet */
  add: (config: FleetMemberConfig<A>) => void;
  /** Remove a member by name */
  remove: (name: string) => boolean;
  /** Get fleet-wide statistics */
  stats: () => FleetStats;
  /** List all member names */
  names: () => string[];
  /** Broadcast an observation to all members */
  observeAll: (event: TriageEvent, metadata?: Record<string, unknown>) => void;
  /** Distill all members */
  distillAll: () => void;
  /** Triage through a specific named instance (safe — returns null if not found) */
  triageWith: (name: string, event: TriageEvent) => Promise<TriageResult<A> | null>;
}

/**
 * Create a fleet that manages multiple myelin instances.
 */
export function createFleet<A extends string = DefaultAction>(
  members?: FleetMemberConfig<A>[],
): MyelinFleet<A> {
  const fleet = new Map<string, Myelin<A>>();

  if (members) {
    for (const m of members) {
      fleet.set(m.name, m.instance);
    }
  }

  return {
    get(name: string) {
      return fleet.get(name);
    },

    add(config: FleetMemberConfig<A>) {
      fleet.set(config.name, config.instance);
    },

    remove(name: string) {
      return fleet.delete(name);
    },

    stats(): FleetStats {
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

    observeAll(event: TriageEvent, metadata?: Record<string, unknown>) {
      for (const instance of fleet.values()) {
        instance.observe(event, metadata);
      }
    },

    distillAll() {
      for (const instance of fleet.values()) {
        instance.distill();
      }
    },

    async triageWith(name: string, event: TriageEvent) {
      const instance = fleet.get(name);
      if (!instance) return null;
      return instance.triageSafe(event);
    },
  };
}
