/**
 * myelin — Singleton Manager
 *
 * Prevents creating duplicate myelin instances for the same configuration.
 * Use when multiple parts of your codebase need the same myelin instance.
 */

import type { MyelinConfig, Myelin, DefaultAction } from './types.ts';
import { createMyelin } from './index.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const instances = new Map<string, Myelin<any>>();

/**
 * Get or create a myelin instance by name.
 * Returns existing instance if one with the same name exists.
 */
export function getOrCreate<A extends string = DefaultAction>(
  name: string,
  config: MyelinConfig<A>,
): Myelin<A> {
  const existing = instances.get(name);
  if (existing) return existing as Myelin<A>;

  const instance = createMyelin(config);
  instances.set(name, instance);
  return instance;
}

/** Get an existing instance by name (returns undefined if not found) */
export function getInstance<A extends string = DefaultAction>(name: string): Myelin<A> | undefined {
  return instances.get(name) as Myelin<A> | undefined;
}

/** Remove an instance by name */
export function removeInstance(name: string): boolean {
  return instances.delete(name);
}

/** List all registered instance names */
export function listInstances(): string[] {
  return [...instances.keys()];
}

/** Clear all instances */
export function clearInstances(): void {
  instances.clear();
}
