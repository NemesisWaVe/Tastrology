/**
 * Result of reading one key from an optional backend. "missing" means the backend answered and the key isn't there;
 * "error" means it couldn't answer (timeout, 5xx, network); "off" means it isn't configured.
 * Lets callers tell a real not-found from a storage blip, so a blip never gets cached as a 404.
 */
export type Lookup<T> = { status: "found"; value: T } | { status: "missing" } | { status: "error" } | { status: "off" };

