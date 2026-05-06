// Runtime predicate for the MULTI_PROVIDER_NORMALIZED feature.
//
// Why this lives in its own module:
//   `feature()` from bun:bundle is a COMPILE-TIME tree-shake macro — it can
//   only be referenced directly inside an if/ternary condition, can't be
//   captured in a variable, can't be stubbed at runtime, and returns false
//   under `bun test` (no bundler step). Tests can't toggle it.
//
//   We still want a build-flag for shipping, AND a runtime knob for tests
//   (and for users who want to opt in without rebuilding). So this module
//   exposes a single predicate that returns true when EITHER:
//     - the build was compiled with --feature=MULTI_PROVIDER_NORMALIZED, OR
//     - FREE_CODE_MULTI_PROVIDER_NORMALIZED is truthy in the environment.
//
// Add MULTI_PROVIDER_NORMALIZED to scripts/build.ts's experimental feature
// list when the actual OpenAI implementation lands; until then the env var
// is the only path that lights it up.

import { feature } from 'bun:bundle'
import { isEnvTruthy } from '../../utils/envUtils.js'

export function isMultiProviderNormalizedEnabled(): boolean {
  if (isEnvTruthy(process.env.FREE_CODE_MULTI_PROVIDER_NORMALIZED)) return true
  if (feature('MULTI_PROVIDER_NORMALIZED')) return true
  return false
}
