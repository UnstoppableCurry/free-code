// Model picker UI. Behavior preserved verbatim from the prior babel-compiled
// version (cache slots stripped — i18n now drives the effort-label line).
// Effort tokens (low/medium/high/max/xhigh) stay in English to match the
// /effort command spec; only the surrounding chrome ("effort"/"(default)"/
// "← → to adjust"/"not supported") is translated.

import * as React from 'react'
import { useState } from 'react'
import { useExitOnCtrlCDWithKeybindings } from 'src/hooks/useExitOnCtrlCDWithKeybindings.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from 'src/services/analytics/index.js'
import {
  FAST_MODE_MODEL_DISPLAY,
  isFastModeAvailable,
  isFastModeCooldown,
  isFastModeEnabled,
} from 'src/utils/fastMode.js'
import { Box, Text } from '../ink.js'
import { useKeybindings } from '../keybindings/useKeybinding.js'
import { useAppState, useSetAppState } from '../state/AppState.js'
import {
  convertEffortValueToLevel,
  type EffortLevel,
  getDefaultEffortForModel,
  getEffortLevelsForModel,
  modelSupportsEffort,
  modelSupportsMaxEffort,
  resolvePickerEffortPersistence,
  toPersistableEffort,
} from '../utils/effort.js'
import {
  getDefaultMainLoopModel,
  type ModelSetting,
  modelDisplayString,
  parseUserSpecifiedModel,
} from '../utils/model/model.js'
import { getModelOptions } from '../utils/model/modelOptions.js'
import {
  getSettingsForSource,
  updateSettingsForSource,
} from '../utils/settings/settings.js'
import { ConfigurableShortcutHint } from './ConfigurableShortcutHint.js'
import { Select } from './CustomSelect/index.js'
import { Byline } from './design-system/Byline.js'
import { KeyboardShortcutHint } from './design-system/KeyboardShortcutHint.js'
import { Pane } from './design-system/Pane.js'
import { effortLevelToSymbol } from './EffortIndicator.js'
import { translations } from '../i18n/locales/index.js'
import {
  createTranslator,
  resolveLocaleFromEnv,
} from '../i18n/translator.js'

const t = createTranslator(resolveLocaleFromEnv(process.env), translations)

export type Props = {
  initial: string | null
  sessionModel?: ModelSetting
  onSelect: (model: string | null, effort: EffortLevel | undefined) => void
  onCancel?: () => void
  isStandaloneCommand?: boolean
  showFastModeNotice?: boolean
  /** Overrides the dim header line below "Select model". */
  headerText?: string
  /**
   * When true, skip writing effortLevel to userSettings on selection.
   * Used by the assistant installer wizard where the model choice is
   * project-scoped (written to the assistant's .claude/settings.json via
   * install.ts) and should not leak to the user's global ~/.claude/settings.
   */
  skipSettingsWrite?: boolean
}

const NO_PREFERENCE = '__NO_PREFERENCE__'

export function ModelPicker({
  initial,
  sessionModel,
  onSelect,
  onCancel,
  isStandaloneCommand,
  showFastModeNotice,
  headerText,
  skipSettingsWrite,
}: Props): React.ReactNode {
  const setAppState = useSetAppState()
  const exitState = useExitOnCtrlCDWithKeybindings()
  const initialValue = initial === null ? NO_PREFERENCE : initial
  const [focusedValue, setFocusedValue] = useState(initialValue)
  const isFastMode = useAppState(s =>
    isFastModeEnabled() ? s.fastMode : false,
  )
  const [hasToggledEffort, setHasToggledEffort] = useState(false)
  const effortValue = useAppState(s => s.effortValue)
  const [effort, setEffort] = useState<EffortLevel | undefined>(
    effortValue !== undefined ? convertEffortValueToLevel(effortValue) : undefined,
  )

  const modelOptions = getModelOptions(isFastMode ?? false)
  const optionsWithInitial =
    initial !== null && !modelOptions.some(opt => opt.value === initial)
      ? [
          ...modelOptions,
          {
            value: initial,
            label: modelDisplayString(initial),
            description: 'Current model',
          },
        ]
      : modelOptions

  const selectOptions = optionsWithInitial.map(opt => ({
    ...opt,
    value: opt.value === null ? NO_PREFERENCE : opt.value,
  }))
  const initialFocusValue = selectOptions.some(o => o.value === initialValue)
    ? initialValue
    : selectOptions[0]?.value ?? undefined
  const visibleCount = Math.min(10, selectOptions.length)
  const hiddenCount = Math.max(0, selectOptions.length - visibleCount)

  const focusedModelName = selectOptions.find(opt => opt.value === focusedValue)
    ?.label
  const focusedModel = resolveOptionModel(focusedValue)
  const focusedSupportsEffort = focusedModel
    ? modelSupportsEffort(focusedModel)
    : false
  const focusedSupportsMax = focusedModel
    ? modelSupportsMaxEffort(focusedModel)
    : false
  const focusedDefaultEffort = getDefaultEffortLevelForOption(focusedValue)
  const displayEffort =
    effort === 'max' && !focusedSupportsMax ? 'high' : effort

  const handleFocus = (value: string): void => {
    setFocusedValue(value)
    if (!hasToggledEffort && effortValue === undefined) {
      setEffort(getDefaultEffortLevelForOption(value))
    }
  }

  const handleCycleEffort = (direction: 'left' | 'right'): void => {
    if (!focusedSupportsEffort) {
      return
    }
    setEffort(prev =>
      cycleEffortLevel(
        prev ?? focusedDefaultEffort,
        direction,
        resolveOptionModel(focusedValue) ?? '',
      ),
    )
    setHasToggledEffort(true)
  }

  useKeybindings(
    {
      'modelPicker:decreaseEffort': () => handleCycleEffort('left'),
      'modelPicker:increaseEffort': () => handleCycleEffort('right'),
    },
    { context: 'ModelPicker' },
  )

  const handleSelect = (value: string): void => {
    logEvent('tengu_model_command_menu_effort', {
      effort: effort as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
    })
    if (!skipSettingsWrite) {
      const effortLevel = resolvePickerEffortPersistence(
        effort,
        getDefaultEffortLevelForOption(value),
        getSettingsForSource('userSettings')?.effortLevel,
        hasToggledEffort,
      )
      const persistable = toPersistableEffort(effortLevel)
      if (persistable !== undefined) {
        updateSettingsForSource('userSettings', { effortLevel: persistable })
      }
      setAppState(prev => ({ ...prev, effortValue: effortLevel }))
    }
    const selectedModel = resolveOptionModel(value)
    const selectedEffort =
      hasToggledEffort && selectedModel && modelSupportsEffort(selectedModel)
        ? effort
        : undefined
    if (value === NO_PREFERENCE) {
      onSelect(null, selectedEffort)
      return
    }
    onSelect(value, selectedEffort)
  }

  const headerLine = headerText
    ?? 'Switch between Claude models. Applies to this session and future Claude Code sessions. For other/previous model names, specify with --model.'

  const effortLine = focusedSupportsEffort ? (
    <Text dimColor={true}>
      <EffortLevelIndicator effort={displayEffort} />{' '}
      {t('modelPicker.effortLabel', { level: displayEffort ?? '' })}
      {displayEffort === focusedDefaultEffort
        ? t('modelPicker.effortDefault')
        : ''}
      {' '}
      <Text color="subtle">{t('modelPicker.effortAdjustHint')}</Text>
    </Text>
  ) : (
    <Text color="subtle">
      <EffortLevelIndicator effort={undefined} />{' '}
      {focusedModelName
        ? t('modelPicker.effortNotSupportedFor', { model: focusedModelName })
        : t('modelPicker.effortNotSupported')}
    </Text>
  )

  const fastModeNotice = isFastModeEnabled()
    ? showFastModeNotice
      ? (
        <Box marginBottom={1}>
          <Text dimColor={true}>
            Fast mode is <Text bold={true}>ON</Text> and available with{' '}
            {FAST_MODE_MODEL_DISPLAY} only (/fast). Switching to other models turn off fast mode.
          </Text>
        </Box>
      )
      : isFastModeAvailable() && !isFastModeCooldown()
      ? (
        <Box marginBottom={1}>
          <Text dimColor={true}>
            Use <Text bold={true}>/fast</Text> to turn on Fast mode ({FAST_MODE_MODEL_DISPLAY} only).
          </Text>
        </Box>
      )
      : null
    : null

  const content = (
    <Box flexDirection="column">
      <Box flexDirection="column">
        <Box marginBottom={1} flexDirection="column">
          <Text color="remember" bold={true}>Select model</Text>
          <Text dimColor={true}>{headerLine}</Text>
          {sessionModel && (
            <Text dimColor={true}>
              Currently using {modelDisplayString(sessionModel)} for this session (set by plan mode). Selecting a model will undo this.
            </Text>
          )}
        </Box>
        <Box flexDirection="column" marginBottom={1}>
          <Box flexDirection="column">
            <Select
              defaultValue={initialValue}
              defaultFocusValue={initialFocusValue}
              options={selectOptions}
              onChange={handleSelect}
              onFocus={handleFocus}
              onCancel={onCancel ?? (() => {})}
              visibleOptionCount={visibleCount}
            />
          </Box>
          {hiddenCount > 0 && (
            <Box paddingLeft={3}>
              <Text dimColor={true}>and {hiddenCount} more…</Text>
            </Box>
          )}
        </Box>
        <Box marginBottom={1} flexDirection="column">{effortLine}</Box>
        {fastModeNotice}
      </Box>
      {isStandaloneCommand && (
        <Text dimColor={true} italic={true}>
          {exitState.pending ? (
            <>Press {exitState.keyName} again to exit</>
          ) : (
            <Byline>
              <KeyboardShortcutHint shortcut="Enter" action="confirm" />
              <ConfigurableShortcutHint
                action="select:cancel"
                context="Select"
                fallback="Esc"
                description="exit"
              />
            </Byline>
          )}
        </Text>
      )}
    </Box>
  )

  if (!isStandaloneCommand) {
    return content
  }
  return <Pane color="permission">{content}</Pane>
}

function resolveOptionModel(value?: string): string | undefined {
  if (!value) return undefined
  return value === NO_PREFERENCE
    ? getDefaultMainLoopModel()
    : parseUserSpecifiedModel(value)
}

function EffortLevelIndicator({
  effort,
}: {
  effort: EffortLevel | undefined
}): React.ReactNode {
  const color = effort ? 'claude' : 'subtle'
  const symbol = effortLevelToSymbol(effort ?? 'low')
  return <Text color={color}>{symbol}</Text>
}

function cycleEffortLevel(
  current: EffortLevel,
  direction: 'left' | 'right',
  model: string,
): EffortLevel {
  // Per-model effort schema. gpt-5.x/o-series have 4 levels including
  // 'minimal'; opus-4-7 has 5 including 'xhigh'; older models 3-4.
  const levels = getEffortLevelsForModel(model)
  // If the current level isn't in this model's cycle (e.g. switching from
  // opus-4-7's 'xhigh' to a gpt-5 menu without it), clamp to the closest
  // valid level — middle of the range.
  const idx = levels.indexOf(current)
  const currentIndex = idx !== -1 ? idx : Math.floor(levels.length / 2)
  if (direction === 'right') {
    return levels[(currentIndex + 1) % levels.length]!
  } else {
    return levels[(currentIndex - 1 + levels.length) % levels.length]!
  }
}

function getDefaultEffortLevelForOption(value?: string): EffortLevel {
  const resolved = resolveOptionModel(value) ?? getDefaultMainLoopModel()
  const defaultValue = getDefaultEffortForModel(resolved)
  return defaultValue !== undefined
    ? convertEffortValueToLevel(defaultValue)
    : 'high'
}
