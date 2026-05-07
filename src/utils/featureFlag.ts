// Replacement for bun:bundle's `feature(flagName)` —— runtime stub that always
// returns false. Originally bun:bundle was a compile-time virtual module: when
// `bun build --define feature("X")=true` is used, calls inline to constants.
// In a "ship TS source + bun runs it directly" distribution model we don't
// build, so all feature flags are off by default. That matches the npm
// release config: experimental flags off, production-safe paths only.
//
// Why not use bun:bundle at runtime: bun:bundle was added in Bun 1.3+. Older
// Bun versions (1.2.x, especially on Windows) parse 'bun:bundle' as the package
// name 'bundle' and explode at module load. Routing through this shim makes
// wtcc work on any Bun >= 1.0.

export function feature(_flagName: string): boolean {
  return false
}
