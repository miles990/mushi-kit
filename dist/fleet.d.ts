/**
 * myelin — Fleet
 *
 * Manages multiple myelin instances with shared observation.
 * Use when your system has multiple decision domains
 * (e.g. triage, routing, learning) each with their own crystallization.
 */
import type { Myelin, FleetMemberConfig, FleetStats, TriageEvent, TriageResult, DefaultAction } from './types.ts';
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
export declare function createFleet<A extends string = DefaultAction>(members?: FleetMemberConfig<A>[]): MyelinFleet<A>;
//# sourceMappingURL=fleet.d.ts.map