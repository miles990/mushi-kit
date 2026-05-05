/**
 * myelin — Singleton Manager
 *
 * Prevents creating duplicate myelin instances for the same configuration.
 * Use when multiple parts of your codebase need the same myelin instance.
 */
import type { MyelinConfig, Myelin, DefaultAction } from './types.ts';
/**
 * Get or create a myelin instance by name.
 * Returns existing instance if one with the same name exists.
 */
export declare function getOrCreate<A extends string = DefaultAction>(name: string, config: MyelinConfig<A>): Myelin<A>;
/** Get an existing instance by name (returns undefined if not found) */
export declare function getInstance<A extends string = DefaultAction>(name: string): Myelin<A> | undefined;
/** Remove an instance by name */
export declare function removeInstance(name: string): boolean;
/** List all registered instance names */
export declare function listInstances(): string[];
/** Clear all instances */
export declare function clearInstances(): void;
//# sourceMappingURL=singleton.d.ts.map