import React, { type ReactNode, useState } from 'react'
import { Box, Text } from '../../ink.js'
import { useT } from '../../i18n/context.js'
import type { KeybindingAction } from '../../keybindings/types.js'
import { useKeybindings } from '../../keybindings/useKeybinding.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../services/analytics/index.js'
import { useSetAppState } from '../../state/AppState.js'
import { type OptionWithDescription, Select } from '../CustomSelect/select.js'

export type FeedbackType = 'accept' | 'reject'

export type PermissionPromptOption<T extends string> = {
  value: T
  label: ReactNode
  feedbackConfig?: {
    type: FeedbackType
    placeholder?: string
  }
  keybinding?: KeybindingAction
}

export type ToolAnalyticsContext = {
  toolName: string
  isMcp: boolean
}

export type PermissionPromptProps<T extends string> = {
  options: PermissionPromptOption<T>[]
  onSelect: (value: T, feedback?: string) => void
  onCancel?: () => void
  question?: string | ReactNode
  toolAnalyticsContext?: ToolAnalyticsContext
}

/**
 * Shared component for permission prompts with optional feedback input.
 *
 * Handles:
 * - "Do you want to proceed?" question with optional Tab hint
 * - Input mode toggling (Tab to expand feedback input)
 * - Analytics events for feedback interactions
 * - Transforming options to Select-compatible format
 */
export function PermissionPrompt<T extends string>({
  options,
  onSelect,
  onCancel,
  question,
  toolAnalyticsContext,
}: PermissionPromptProps<T>): React.ReactNode {
  const t = useT()
  const setAppState = useSetAppState()
  const [acceptFeedback, setAcceptFeedback] = useState('')
  const [rejectFeedback, setRejectFeedback] = useState('')
  const [acceptInputMode, setAcceptInputMode] = useState(false)
  const [rejectInputMode, setRejectInputMode] = useState(false)
  const [focusedValue, setFocusedValue] = useState<T | null>(null)
  const [acceptFeedbackModeEntered, setAcceptFeedbackModeEntered] =
    useState(false)
  const [rejectFeedbackModeEntered, setRejectFeedbackModeEntered] =
    useState(false)

  const resolvedQuestion =
    question ?? t('ui.permissions.prompt.doYouWantToProceed')

  const defaultPlaceholders: Record<FeedbackType, string> = {
    accept: t('ui.permissions.prompt.placeholderAccept'),
    reject: t('ui.permissions.prompt.placeholderReject'),
  }

  const focusedOption = options.find(opt => opt.value === focusedValue)
  const focusedFeedbackType = focusedOption?.feedbackConfig?.type
  const showTabHint =
    (focusedFeedbackType === 'accept' && !acceptInputMode) ||
    (focusedFeedbackType === 'reject' && !rejectInputMode)

  const selectOptions: OptionWithDescription<T>[] = options.map(opt => {
    const { value, label, feedbackConfig } = opt
    if (!feedbackConfig) {
      return { label, value }
    }
    const { type, placeholder } = feedbackConfig
    const isInputMode = type === 'accept' ? acceptInputMode : rejectInputMode
    const onChange = type === 'accept' ? setAcceptFeedback : setRejectFeedback
    const defaultPlaceholder = defaultPlaceholders[type]
    if (isInputMode) {
      return {
        type: 'input' as const,
        label,
        value,
        placeholder: placeholder ?? defaultPlaceholder,
        onChange,
        allowEmptySubmitToCancel: true,
      }
    }
    return { label, value }
  })

  function handleInputModeToggle(value: T): void {
    const option = options.find(opt => opt.value === value)
    if (!option?.feedbackConfig) {
      return
    }
    const { type } = option.feedbackConfig
    const analyticsProps = {
      toolName:
        toolAnalyticsContext?.toolName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
      isMcp: toolAnalyticsContext?.isMcp ?? false,
    }
    if (type === 'accept') {
      if (acceptInputMode) {
        setAcceptInputMode(false)
        logEvent('tengu_accept_feedback_mode_collapsed', analyticsProps)
      } else {
        setAcceptInputMode(true)
        setAcceptFeedbackModeEntered(true)
        logEvent('tengu_accept_feedback_mode_entered', analyticsProps)
      }
    } else if (type === 'reject') {
      if (rejectInputMode) {
        setRejectInputMode(false)
        logEvent('tengu_reject_feedback_mode_collapsed', analyticsProps)
      } else {
        setRejectInputMode(true)
        setRejectFeedbackModeEntered(true)
        logEvent('tengu_reject_feedback_mode_entered', analyticsProps)
      }
    }
  }

  function handleSelect(value: T): void {
    const option = options.find(opt => opt.value === value)
    if (!option) {
      return
    }
    let feedback: string | undefined
    if (option.feedbackConfig) {
      const rawFeedback =
        option.feedbackConfig.type === 'accept'
          ? acceptFeedback
          : rejectFeedback
      const trimmedFeedback = rawFeedback.trim()
      if (trimmedFeedback) {
        feedback = trimmedFeedback
      }
      const analyticsProps = {
        toolName:
          toolAnalyticsContext?.toolName as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
        isMcp: toolAnalyticsContext?.isMcp ?? false,
        has_instructions: !!trimmedFeedback,
        instructions_length: trimmedFeedback?.length ?? 0,
        entered_feedback_mode:
          option.feedbackConfig.type === 'accept'
            ? acceptFeedbackModeEntered
            : rejectFeedbackModeEntered,
      }
      if (option.feedbackConfig.type === 'accept') {
        logEvent('tengu_accept_submitted', analyticsProps)
      } else if (option.feedbackConfig.type === 'reject') {
        logEvent('tengu_reject_submitted', analyticsProps)
      }
    }
    onSelect(value, feedback)
  }

  const keybindingHandlers: Partial<Record<KeybindingAction, () => void>> = {}
  for (const opt of options) {
    if (opt.keybinding) {
      keybindingHandlers[opt.keybinding] = () => handleSelect(opt.value)
    }
  }

  useKeybindings(keybindingHandlers, {
    context: t('ui.permissions.confirmation.context'),
  })

  function handleCancel(): void {
    logEvent('tengu_permission_request_escape', {})
    setAppState(prev => ({
      ...prev,
      attribution: {
        ...prev.attribution,
        escapeCount: prev.attribution.escapeCount + 1,
      },
    }))
    onCancel?.()
  }

  function handleFocus(value: T): void {
    const newOption = options.find(opt => opt.value === value)
    if (
      newOption?.feedbackConfig?.type !== 'accept' &&
      acceptInputMode &&
      !acceptFeedback.trim()
    ) {
      setAcceptInputMode(false)
    }
    if (
      newOption?.feedbackConfig?.type !== 'reject' &&
      rejectInputMode &&
      !rejectFeedback.trim()
    ) {
      setRejectInputMode(false)
    }
    setFocusedValue(value)
  }

  const questionNode =
    typeof resolvedQuestion === 'string' ? (
      <Text>{resolvedQuestion}</Text>
    ) : (
      resolvedQuestion
    )

  return (
    <Box flexDirection="column">
      {questionNode}
      <Select
        options={selectOptions}
        inlineDescriptions={true}
        onChange={handleSelect}
        onCancel={handleCancel}
        onFocus={handleFocus}
        onInputModeToggle={handleInputModeToggle}
      />
      <Box marginTop={1}>
        <Text dimColor>
          {t('ui.permissions.prompt.escToCancel')}
          {showTabHint && t('ui.permissions.prompt.tabToAmend')}
        </Text>
      </Box>
    </Box>
  )
}
