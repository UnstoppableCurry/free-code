// Routing-gate contract for the MULTI_PROVIDER_NORMALIZED feature flag.
//
// Phase B, slice 1: prove the dispatch gate works. We do NOT exercise the full
// queryModel async generator here (it pulls in the entire CLI surface — auth,
// growthbook, MCP, ink). Instead we test the two pieces that compose the gate:
//
//   1) isMultiProviderNormalizedEnabled() — runtime predicate that reads
//      FREE_CODE_MULTI_PROVIDER_NORMALIZED and (when bundled) feature(...).
//      `feature()` from bun:bundle is a compile-time tree-shake macro; under
//      `bun test` (no bundle step) it returns false unconditionally, so the env
//      var is the only knob tests can flip.
//
//   2) queryModelOpenAI — the stub destination. Importing it must not crash;
//      invoking it must throw the NotImplemented marker so the next slice has
//      a clear RED to flip GREEN when the adapter wiring lands.
//
// Together these lock the contract that claude.ts:queryModel checks at the
// top of the function: gate ON + provider 'openai' → delegate to
// queryModelOpenAI; otherwise fall through to the existing Anthropic SDK path.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { isMultiProviderNormalizedEnabled } from '../../src/services/api/multiProviderGate.ts'

const ENV_KEY = 'FREE_CODE_MULTI_PROVIDER_NORMALIZED'

describe('MULTI_PROVIDER_NORMALIZED routing gate', () => {
  let prev: string | undefined
  beforeEach(() => {
    prev = process.env[ENV_KEY]
    delete process.env[ENV_KEY]
  })
  afterEach(() => {
    if (prev === undefined) delete process.env[ENV_KEY]
    else process.env[ENV_KEY] = prev
  })

  test('default: gate is OFF when env is unset', () => {
    expect(isMultiProviderNormalizedEnabled()).toBe(false)
  })

  test('env=1 turns gate ON', () => {
    process.env[ENV_KEY] = '1'
    expect(isMultiProviderNormalizedEnabled()).toBe(true)
  })

  test('env=true turns gate ON', () => {
    process.env[ENV_KEY] = 'true'
    expect(isMultiProviderNormalizedEnabled()).toBe(true)
  })

  test('env=0 keeps gate OFF', () => {
    process.env[ENV_KEY] = '0'
    expect(isMultiProviderNormalizedEnabled()).toBe(false)
  })
})

describe('queryModelOpenAI module surface', () => {
  // Slice 2 replaced the NotImplemented stub with a real implementation.
  // The behavioral contract for the implementation lives in
  // tests/protocol/claude-openai.test.ts. Here we only assert the module
  // exposes the queryModelOpenAI export so claude.ts's import resolves.
  test('queryModelOpenAI is exported as a function', async () => {
    const mod = await import('../../src/services/api/claude-openai.ts')
    expect(typeof mod.queryModelOpenAI).toBe('function')
  })
})

describe('claude.ts dispatches to queryModelOpenAI when gate ON + provider openai', () => {
  // We can't realistically invoke queryModel end-to-end in a unit test (it
  // pulls auth, MCP, growthbook). Instead we assert the gate by reading the
  // source file: the dispatch branch must reference both the gate predicate
  // and queryModelOpenAI, and must early-return. This is a CHARACTERIZATION
  // test — it locks the textual presence of the dispatch hook so a refactor
  // that accidentally drops the branch fails loudly.
  test('claude.ts contains the dispatch branch wiring', async () => {
    const file = Bun.file(
      new URL('../../src/services/api/claude.ts', import.meta.url),
    )
    const src = await file.text()
    expect(src).toContain('isMultiProviderNormalizedEnabled')
    expect(src).toContain('queryModelOpenAI')
    // The branch must be inside queryModel and must early-yield-from + return.
    expect(src).toMatch(/yield\*\s+queryModelOpenAI/)
  })
})
