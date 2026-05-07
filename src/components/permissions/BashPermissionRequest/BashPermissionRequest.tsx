import { feature } from 'src/utils/featureFlag.js'
import figures from 'figures'
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useT } from '../../../i18n/context.js'
import { Box, Text, useTheme } from '../../../ink.js'
import { useKeybinding } from '../../../keybindings/useKeybinding.js'
import { getFeatureValue_CACHED_MAY_BE_STALE } from '../../../services/analytics/growthbook.js'
import {
  type AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS,
  logEvent,
} from '../../../services/analytics/index.js'
import { sanitizeToolNameForAnalytics } from '../../../services/analytics/metadata.js'
import { useAppState } from '../../../state/AppState.js'
import { BashTool } from '../../../tools/BashTool/BashTool.js'
import {
  getFirstWordPrefix,
  getSimpleCommandPrefix,
} from '../../../tools/BashTool/bashPermissions.js'
import { getDestructiveCommandWarning } from '../../../tools/BashTool/destructiveCommandWarning.js'
import { parseSedEditCommand } from '../../../tools/BashTool/sedEditParser.js'
import { shouldUseSandbox } from '../../../tools/BashTool/shouldUseSandbox.js'
import { getCompoundCommandPrefixesStatic } from '../../../utils/bash/prefix.js'
import {
  createPromptRuleContent,
  generateGenericDescription,
  getBashPromptAllowDescriptions,
  isClassifierPermissionsEnabled,
} from '../../../utils/permissions/bashClassifier.js'
import { extractRules } from '../../../utils/permissions/PermissionUpdate.js'
import type { PermissionUpdate } from '../../../utils/permissions/PermissionUpdateSchema.js'
import { SandboxManager } from '../../../utils/sandbox/sandbox-adapter.js'
import { Select } from '../../CustomSelect/select.js'
import { ShimmerChar } from '../../Spinner/ShimmerChar.js'
import { useShimmerAnimation } from '../../Spinner/useShimmerAnimation.js'
import { type UnaryEvent, usePermissionRequestLogging } from '../hooks.js'
import { PermissionDecisionDebugInfo } from '../PermissionDecisionDebugInfo.js'
import { PermissionDialog } from '../PermissionDialog.js'
import {
  PermissionExplainerContent,
  usePermissionExplainerUI,
} from '../PermissionExplanation.js'
import type { PermissionRequestProps } from '../PermissionRequest.js'
import { PermissionRuleExplanation } from '../PermissionRuleExplanation.js'
import { SedEditPermissionRequest } from '../SedEditPermissionRequest/SedEditPermissionRequest.js'
import { useShellPermissionFeedback } from '../useShellPermissionFeedback.js'
import { logUnaryPermissionEvent } from '../utils.js'
import { bashToolUseOptions } from './bashToolUseOptions.js'

// Isolates the 20fps shimmer clock from BashPermissionRequestInner. Before this
// extraction, useShimmerAnimation lived inside the 535-line Inner body, so every
// 50ms clock tick re-rendered the entire dialog.
function ClassifierCheckingSubtitle(): React.ReactNode {
  const t = useT()
  const checkingText = t('ui.permissions.shell.checkingAutoApprove')
  const [ref, glimmerIndex] = useShimmerAnimation(
    'requesting',
    checkingText,
    false,
  )
  return (
    <Box ref={ref}>
      <Text>
        {[...checkingText].map((char, i) => (
          <ShimmerChar
            key={i}
            char={char}
            index={i}
            glimmerIndex={glimmerIndex}
            messageColor="inactive"
            shimmerColor="subtle"
          />
        ))}
      </Text>
    </Box>
  )
}

export function BashPermissionRequest(
  props: PermissionRequestProps,
): React.ReactNode {
  const { toolUseConfirm, toolUseContext, onDone, onReject, verbose, workerBadge } =
    props
  const { command, description } = BashTool.inputSchema.parse(
    toolUseConfirm.input,
  )
  const sedInfo = parseSedEditCommand(command)

  if (sedInfo) {
    return (
      <SedEditPermissionRequest
        toolUseConfirm={toolUseConfirm}
        toolUseContext={toolUseContext}
        onDone={onDone}
        onReject={onReject}
        verbose={verbose}
        workerBadge={workerBadge}
        sedInfo={sedInfo}
      />
    )
  }

  return (
    <BashPermissionRequestInner
      toolUseConfirm={toolUseConfirm}
      toolUseContext={toolUseContext}
      onDone={onDone}
      onReject={onReject}
      verbose={verbose}
      workerBadge={workerBadge}
      command={command}
      description={description}
    />
  )
}

// Inner component that uses hooks - only called for non-MCP CLI commands
function BashPermissionRequestInner({
  toolUseConfirm,
  toolUseContext,
  onDone,
  onReject,
  verbose: _verbose,
  workerBadge,
  command,
  description,
}: PermissionRequestProps & {
  command: string
  description?: string
}): React.ReactNode {
  const t = useT()
  const [theme] = useTheme()
  const toolPermissionContext = useAppState(s => s.toolPermissionContext)
  const explainerState = usePermissionExplainerUI({
    toolName: toolUseConfirm.tool.name,
    toolInput: toolUseConfirm.input,
    toolDescription: toolUseConfirm.description,
    messages: toolUseContext.messages,
  })
  const {
    yesInputMode,
    noInputMode,
    yesFeedbackModeEntered,
    noFeedbackModeEntered,
    acceptFeedback,
    rejectFeedback,
    setAcceptFeedback,
    setRejectFeedback,
    focusedOption,
    handleInputModeToggle,
    handleReject,
    handleFocus,
  } = useShellPermissionFeedback({
    toolUseConfirm,
    onDone,
    onReject,
    explainerVisible: explainerState.visible,
  })
  const [showPermissionDebug, setShowPermissionDebug] = useState(false)
  const [classifierDescription, setClassifierDescription] = useState(
    description || '',
  )
  const [
    initialClassifierDescriptionEmpty,
    setInitialClassifierDescriptionEmpty,
  ] = useState(!description?.trim())

  useEffect(() => {
    if (!isClassifierPermissionsEnabled()) return
    const abortController = new AbortController()
    generateGenericDescription(command, description, abortController.signal)
      .then(generic => {
        if (generic && !abortController.signal.aborted) {
          setClassifierDescription(generic)
          setInitialClassifierDescriptionEmpty(false)
        }
      })
      .catch(() => {})
    return () => abortController.abort()
  }, [command, description])

  const isCompound =
    toolUseConfirm.permissionResult.decisionReason?.type === 'subcommandResults'

  const [editablePrefix, setEditablePrefix] = useState<string | undefined>(
    () => {
      if (isCompound) {
        const backendBashRules = extractRules(
          'suggestions' in toolUseConfirm.permissionResult
            ? toolUseConfirm.permissionResult.suggestions
            : undefined,
        ).filter(r => r.toolName === BashTool.name && r.ruleContent)
        return backendBashRules.length === 1
          ? backendBashRules[0]!.ruleContent
          : undefined
      }
      const two = getSimpleCommandPrefix(command)
      if (two) return `${two}:*`
      const one = getFirstWordPrefix(command)
      if (one) return `${one}:*`
      return command
    },
  )
  const hasUserEditedPrefix = useRef(false)
  const onEditablePrefixChange = useCallback((value: string) => {
    hasUserEditedPrefix.current = true
    setEditablePrefix(value)
  }, [])
  useEffect(() => {
    if (isCompound) return
    let cancelled = false
    getCompoundCommandPrefixesStatic(command, subcmd =>
      BashTool.isReadOnly({ command: subcmd }),
    )
      .then(prefixes => {
        if (cancelled || hasUserEditedPrefix.current) return
        if (prefixes.length > 0) {
          setEditablePrefix(`${prefixes[0]}:*`)
        }
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [command, isCompound])

  const [classifierWasChecking] = useState(
    feature('BASH_CLASSIFIER')
      ? !!toolUseConfirm.classifierCheckInProgress
      : false,
  )

  const {
    destructiveWarning: destructiveWarning_0,
    sandboxingEnabled: sandboxingEnabled_0,
    isSandboxed: isSandboxed_0,
  } = useMemo(() => {
    const destructiveWarning = getFeatureValue_CACHED_MAY_BE_STALE(
      'tengu_destructive_command_warning',
      false,
    )
      ? getDestructiveCommandWarning(command)
      : null
    const sandboxingEnabled = SandboxManager.isSandboxingEnabled()
    const isSandboxed =
      sandboxingEnabled && shouldUseSandbox(toolUseConfirm.input)
    return { destructiveWarning, sandboxingEnabled, isSandboxed }
  }, [command, toolUseConfirm.input])

  const unaryEvent = useMemo<UnaryEvent>(
    () => ({ completion_type: 'tool_use_single', language_name: 'none' }),
    [],
  )
  usePermissionRequestLogging(toolUseConfirm, unaryEvent)
  const existingAllowDescriptions = useMemo(
    () => getBashPromptAllowDescriptions(toolPermissionContext),
    [toolPermissionContext],
  )
  const options = useMemo(
    () =>
      bashToolUseOptions({
        suggestions:
          toolUseConfirm.permissionResult.behavior === 'ask'
            ? toolUseConfirm.permissionResult.suggestions
            : undefined,
        decisionReason: toolUseConfirm.permissionResult.decisionReason,
        onRejectFeedbackChange: setRejectFeedback,
        onAcceptFeedbackChange: setAcceptFeedback,
        onClassifierDescriptionChange: setClassifierDescription,
        classifierDescription,
        initialClassifierDescriptionEmpty,
        existingAllowDescriptions,
        yesInputMode,
        noInputMode,
        editablePrefix,
        onEditablePrefixChange,
      }),
    [
      toolUseConfirm,
      classifierDescription,
      initialClassifierDescriptionEmpty,
      existingAllowDescriptions,
      yesInputMode,
      noInputMode,
      editablePrefix,
      onEditablePrefixChange,
    ],
  )

  const handleToggleDebug = useCallback(() => {
    setShowPermissionDebug(prev => !prev)
  }, [])
  useKeybinding('permission:toggleDebug', handleToggleDebug, {
    context: t('ui.permissions.confirmation.context'),
  })

  const handleDismissCheckmark = useCallback(() => {
    toolUseConfirm.onDismissCheckmark?.()
  }, [toolUseConfirm])
  useKeybinding('confirm:no', handleDismissCheckmark, {
    context: t('ui.permissions.confirmation.context'),
    isActive: feature('BASH_CLASSIFIER')
      ? !!toolUseConfirm.classifierAutoApproved
      : false,
  })

  function onSelect(value: string): void {
    let optionIndex: Record<string, number> = {
      yes: 1,
      'yes-apply-suggestions': 2,
      'yes-prefix-edited': 2,
      no: 3,
    }
    if (feature('BASH_CLASSIFIER')) {
      optionIndex = {
        yes: 1,
        'yes-apply-suggestions': 2,
        'yes-prefix-edited': 2,
        'yes-classifier-reviewed': 3,
        no: 4,
      }
    }
    logEvent('tengu_permission_request_option_selected', {
      option_index: optionIndex[value],
      explainer_visible: explainerState.visible,
    })
    const toolNameForAnalytics = sanitizeToolNameForAnalytics(
      toolUseConfirm.tool.name,
    ) as AnalyticsMetadata_I_VERIFIED_THIS_IS_NOT_CODE_OR_FILEPATHS

    if (value === 'yes-prefix-edited') {
      const trimmedPrefix = (editablePrefix ?? '').trim()
      logUnaryPermissionEvent('tool_use_single', toolUseConfirm, 'accept')
      if (!trimmedPrefix) {
        toolUseConfirm.onAllow(toolUseConfirm.input, [])
      } else {
        const prefixUpdates: PermissionUpdate[] = [
          {
            type: 'addRules',
            rules: [
              { toolName: BashTool.name, ruleContent: trimmedPrefix },
            ],
            behavior: 'allow',
            destination: 'localSettings',
          },
        ]
        toolUseConfirm.onAllow(toolUseConfirm.input, prefixUpdates)
      }
      onDone()
      return
    }

    if (feature('BASH_CLASSIFIER') && value === 'yes-classifier-reviewed') {
      const trimmedDescription = classifierDescription.trim()
      logUnaryPermissionEvent('tool_use_single', toolUseConfirm, 'accept')
      if (!trimmedDescription) {
        toolUseConfirm.onAllow(toolUseConfirm.input, [])
      } else {
        const permissionUpdates: PermissionUpdate[] = [
          {
            type: 'addRules',
            rules: [
              {
                toolName: BashTool.name,
                ruleContent: createPromptRuleContent(trimmedDescription),
              },
            ],
            behavior: 'allow',
            destination: 'session',
          },
        ]
        toolUseConfirm.onAllow(toolUseConfirm.input, permissionUpdates)
      }
      onDone()
      return
    }

    switch (value) {
      case 'yes': {
        const trimmedFeedback = acceptFeedback.trim()
        logUnaryPermissionEvent('tool_use_single', toolUseConfirm, 'accept')
        logEvent('tengu_accept_submitted', {
          toolName: toolNameForAnalytics,
          isMcp: toolUseConfirm.tool.isMcp ?? false,
          has_instructions: !!trimmedFeedback,
          instructions_length: trimmedFeedback.length,
          entered_feedback_mode: yesFeedbackModeEntered,
        })
        toolUseConfirm.onAllow(
          toolUseConfirm.input,
          [],
          trimmedFeedback || undefined,
        )
        onDone()
        break
      }
      case 'yes-apply-suggestions': {
        logUnaryPermissionEvent('tool_use_single', toolUseConfirm, 'accept')
        const permissionUpdates =
          'suggestions' in toolUseConfirm.permissionResult
            ? toolUseConfirm.permissionResult.suggestions || []
            : []
        toolUseConfirm.onAllow(toolUseConfirm.input, permissionUpdates)
        onDone()
        break
      }
      case 'no': {
        const trimmedFeedback = rejectFeedback.trim()
        logEvent('tengu_reject_submitted', {
          toolName: toolNameForAnalytics,
          isMcp: toolUseConfirm.tool.isMcp ?? false,
          has_instructions: !!trimmedFeedback,
          instructions_length: trimmedFeedback.length,
          entered_feedback_mode: noFeedbackModeEntered,
        })
        handleReject(trimmedFeedback || undefined)
        break
      }
    }
  }

  const classifierSubtitle = feature('BASH_CLASSIFIER')
    ? toolUseConfirm.classifierAutoApproved
      ? (
          <Text>
            <Text color="success">
              {figures.tick} {t('ui.permissions.shell.autoApproved')}
            </Text>
            {toolUseConfirm.classifierMatchedRule && (
              <Text dimColor>
                {t('ui.permissions.shell.matchedRulePrefix')}
                {toolUseConfirm.classifierMatchedRule}
                {t('ui.permissions.shell.matchedRuleSuffix')}
              </Text>
            )}
          </Text>
        )
      : toolUseConfirm.classifierCheckInProgress
        ? <ClassifierCheckingSubtitle />
        : classifierWasChecking
          ? <Text dimColor>{t('ui.permissions.shell.requiresManualApproval')}</Text>
          : undefined
    : undefined

  const titleKey =
    sandboxingEnabled_0 && !isSandboxed_0
      ? 'ui.permissions.shell.titleBashUnsandboxed'
      : 'ui.permissions.shell.titleBash'

  return (
    <PermissionDialog
      workerBadge={workerBadge}
      title={t(titleKey)}
      subtitle={classifierSubtitle}
    >
      <Box flexDirection="column" paddingX={2} paddingY={1}>
        <Text dimColor={explainerState.visible}>
          {BashTool.renderToolUseMessage(
            { command, description },
            { theme, verbose: true },
          )}
        </Text>
        {!explainerState.visible && (
          <Text dimColor>{toolUseConfirm.description}</Text>
        )}
        <PermissionExplainerContent
          visible={explainerState.visible}
          promise={explainerState.promise}
        />
      </Box>
      {showPermissionDebug ? (
        <>
          <PermissionDecisionDebugInfo
            permissionResult={toolUseConfirm.permissionResult}
            toolName="Bash"
          />
          {toolUseContext.options.debug && (
            <Box justifyContent="flex-end" marginTop={1}>
              <Text dimColor>{t('ui.permissions.shell.hideDebugInfo')}</Text>
            </Box>
          )}
        </>
      ) : (
        <>
          <Box flexDirection="column">
            <PermissionRuleExplanation
              permissionResult={toolUseConfirm.permissionResult}
              toolType="command"
            />
            {destructiveWarning_0 && (
              <Box marginBottom={1}>
                <Text
                  color="warning"
                  dimColor={
                    feature('BASH_CLASSIFIER')
                      ? toolUseConfirm.classifierAutoApproved
                      : false
                  }
                >
                  {destructiveWarning_0}
                </Text>
              </Box>
            )}
            <Text
              dimColor={
                feature('BASH_CLASSIFIER')
                  ? toolUseConfirm.classifierAutoApproved
                  : false
              }
            >
              {t('ui.permissions.prompt.doYouWantToProceed')}
            </Text>
            <Select
              options={
                feature('BASH_CLASSIFIER')
                  ? toolUseConfirm.classifierAutoApproved
                    ? options.map(o => ({ ...o, disabled: true }))
                    : options
                  : options
              }
              isDisabled={
                feature('BASH_CLASSIFIER')
                  ? toolUseConfirm.classifierAutoApproved
                  : false
              }
              inlineDescriptions
              onChange={onSelect}
              onCancel={() => handleReject()}
              onFocus={handleFocus}
              onInputModeToggle={handleInputModeToggle}
            />
          </Box>
          <Box justifyContent="space-between" marginTop={1}>
            <Text dimColor>
              {t('ui.permissions.prompt.escToCancel')}
              {((focusedOption === 'yes' && !yesInputMode) ||
                (focusedOption === 'no' && !noInputMode)) &&
                t('ui.permissions.prompt.tabToAmend')}
              {explainerState.enabled &&
                (explainerState.visible
                  ? t('ui.permissions.shell.ctrlEToHide')
                  : t('ui.permissions.shell.ctrlEToExplain'))}
            </Text>
            {toolUseContext.options.debug && (
              <Text dimColor>{t('ui.permissions.shell.showDebugInfo')}</Text>
            )}
          </Box>
        </>
      )}
    </PermissionDialog>
  )
}
