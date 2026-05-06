// /effort —— 设置 model 的思考强度。所有用户可见文案走 i18n（key 在
// src/i18n/locales/{zh-CN,en-US}.json 的 command.effort.* 命名空间）。
// 业务行为与原版完全一致：xhigh 仅 Opus 4.7、max 仅 Opus 4.6/4.7 + gpt-5.x +
// o-series；CLAUDE_CODE_EFFORT_LEVEL 在每次 resolveAppliedEffort 时 wins，
// 这里的提示语就是为了让用户在 env 接管时不困惑。

import * as React from 'react'
import { useMainLoopModel } from '../../hooks/useMainLoopModel.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { useAppState, useSetAppState } from '../../state/AppState.js'
import type { LocalJSXCommandOnDone } from '../../types/command.js'
import {
  type EffortValue,
  getDisplayedEffortLevel,
  getEffortEnvOverride,
  getEffortValueDescription,
  isEffortLevel,
  toPersistableEffort,
} from '../../utils/effort.js'
import { updateSettingsForSource } from '../../utils/settings/settings.js'
import { translations } from '../../i18n/locales/index.js'
import {
  createTranslator,
  resolveLocaleFromEnv,
} from '../../i18n/translator.js'

const COMMON_HELP_ARGS = ['help', '-h', '--help']

const t = createTranslator(resolveLocaleFromEnv(process.env), translations)

type EffortCommandResult = {
  message: string
  effortUpdate?: { value: EffortValue | undefined }
}

function setEffortValue(effortValue: EffortValue): EffortCommandResult {
  const persistable = toPersistableEffort(effortValue)
  if (persistable !== undefined) {
    const result = updateSettingsForSource('userSettings', {
      effortLevel: persistable,
    })
    if (result.error) {
      return {
        message: t('command.effort.failed', {
          message: result.error.message,
        }),
      }
    }
  }
  logEvent('tengu_effort_command', {
    effort:
      effortValue as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })

  // Env var wins at resolveAppliedEffort time. Only flag it when it actually
  // conflicts — if env matches what the user just asked for, the outcome is
  // the same, so "Set effort to X" is true and the note is noise.
  const envOverride = getEffortEnvOverride()
  if (envOverride !== undefined && envOverride !== effortValue) {
    const envRaw = process.env.CLAUDE_CODE_EFFORT_LEVEL ?? ''
    if (persistable === undefined) {
      return {
        message: t('command.effort.envOverrideTransient', {
          env: envRaw,
          value: effortValue,
        }),
        effortUpdate: { value: effortValue },
      }
    }
    return {
      message: t('command.effort.envOverrideTakeover', {
        env: envRaw,
        value: effortValue,
      }),
      effortUpdate: { value: effortValue },
    }
  }

  const description = getEffortValueDescription(effortValue)
  const suffix =
    persistable !== undefined ? '' : t('command.effort.sessionOnlySuffix')
  return {
    message: t('command.effort.set', {
      value: effortValue,
      suffix,
      description,
    }),
    effortUpdate: { value: effortValue },
  }
}

export function showCurrentEffort(
  appStateEffort: EffortValue | undefined,
  model: string,
): EffortCommandResult {
  const envOverride = getEffortEnvOverride()
  const effectiveValue =
    envOverride === null ? undefined : envOverride ?? appStateEffort
  if (effectiveValue === undefined) {
    const level = getDisplayedEffortLevel(model, appStateEffort)
    return {
      message: t('command.effort.autoCurrent', { level }),
    }
  }
  const description = getEffortValueDescription(effectiveValue)
  return {
    message: t('command.effort.current', {
      value: effectiveValue,
      description,
    }),
  }
}

function unsetEffortLevel(): EffortCommandResult {
  const result = updateSettingsForSource('userSettings', {
    effortLevel: undefined,
  })
  if (result.error) {
    return {
      message: t('command.effort.failed', { message: result.error.message }),
    }
  }
  logEvent('tengu_effort_command', {
    effort:
      'auto' as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  })
  // env=auto/unset (null) matches what /effort auto asks for, so only warn
  // when env is pinning a specific level that will keep overriding.
  const envOverride = getEffortEnvOverride()
  if (envOverride !== undefined && envOverride !== null) {
    const envRaw = process.env.CLAUDE_CODE_EFFORT_LEVEL ?? ''
    return {
      message: t('command.effort.envStillOverrides', { env: envRaw }),
      effortUpdate: { value: undefined },
    }
  }
  return {
    message: t('command.effort.setAuto'),
    effortUpdate: { value: undefined },
  }
}

export function executeEffort(args: string): EffortCommandResult {
  const normalized = args.toLowerCase()
  if (normalized === 'auto' || normalized === 'unset') {
    return unsetEffortLevel()
  }

  if (!isEffortLevel(normalized)) {
    return {
      message: t('command.effort.invalid', { arg: args }),
    }
  }

  return setEffortValue(normalized)
}

function ShowCurrentEffort({
  onDone,
}: {
  onDone: (result: string) => void
}): React.ReactNode {
  const effortValue = useAppState(s => s.effortValue)
  const model = useMainLoopModel()
  const { message } = showCurrentEffort(effortValue, model)
  onDone(message)
  return null
}

function ApplyEffortAndClose({
  result,
  onDone,
}: {
  result: EffortCommandResult
  onDone: (result: string) => void
}): React.ReactNode {
  const setAppState = useSetAppState()
  const { effortUpdate, message } = result
  React.useEffect(() => {
    if (effortUpdate) {
      setAppState(prev => ({
        ...prev,
        effortValue: effortUpdate.value,
      }))
    }
    onDone(message)
  }, [setAppState, effortUpdate, message, onDone])
  return null
}

export async function call(
  onDone: LocalJSXCommandOnDone,
  _context: unknown,
  args?: string,
): Promise<React.ReactNode> {
  args = args?.trim() || ''

  if (COMMON_HELP_ARGS.includes(args)) {
    onDone(t('command.effort.usage'))
    return
  }

  if (!args || args === 'current' || args === 'status') {
    return <ShowCurrentEffort onDone={onDone} />
  }

  const result = executeEffort(args)
  return <ApplyEffortAndClose result={result} onDone={onDone} />
}
