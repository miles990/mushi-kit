/**
 * myelin — Singleton Manager
 *
 * Prevents creating duplicate myelin instances for the same configuration.
 * Use when multiple parts of your codebase need the same myelin instance.
 */
import { createMyelin } from "./index.js";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const instances = new Map();
/**
 * Get or create a myelin instance by name.
 * Returns existing instance if one with the same name exists.
 */
export function getOrCreate(name, config) {
    const existing = instances.get(name);
    if (existing)
        return existing;
    const instance = createMyelin(config);
    instances.set(name, instance);
    return instance;
}
/** Get an existing instance by name (returns undefined if not found) */
export function getInstance(name) {
    return instances.get(name);
}
/** Remove an instance by name */
export function removeInstance(name) {
    return instances.delete(name);
}
/** List all registered instance names */
export function listInstances() {
    return [...instances.keys()];
}
/** Clear all instances */
export function clearInstances() {
    instances.clear();
}
//# sourceMappingURL=singleton.js.map