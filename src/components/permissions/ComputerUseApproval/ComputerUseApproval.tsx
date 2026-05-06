import { getSentinelCategory } from '@ant/computer-use-mcp/sentinelApps'
import type {
  CuPermissionRequest,
  CuPermissionResponse,
} from '@ant/computer-use-mcp/types'
import { DEFAULT_GRANT_FLAGS } from '@ant/computer-use-mcp/types'
import figures from 'figures'
import * as React from 'react'
import { useState } from 'react'
import { useT } from '../../../i18n/context.js'
import { Box, Text } from '../../../ink.js'
import { execFileNoThrow } from '../../../utils/execFileNoThrow.js'
import type { OptionWithDescription } from '../../CustomSelect/select.js'
import { Select } from '../../CustomSelect/select.js'
import { Dialog } from '../../design-system/Dialog.js'

type ComputerUseApprovalProps = {
  request: CuPermissionRequest
  onDone: (response: CuPermissionResponse) => void
}

const DENY_ALL_RESPONSE: CuPermissionResponse = {
  granted: [],
  denied: [],
  flags: DEFAULT_GRANT_FLAGS,
}

/**
 * Two-panel dispatcher. When `request.tccState` is present, macOS permissions
 * (Accessibility / Screen Recording) are missing and the app list is
 * irrelevant — show a TCC panel that opens System Settings. Otherwise show the
 * app allowlist + grant-flags panel.
 */
export function ComputerUseApproval({
  request,
  onDone,
}: ComputerUseApprovalProps): React.ReactNode {
  if (request.tccState) {
    return (
      <ComputerUseTccPanel
        tccState={request.tccState}
        onDone={() => onDone(DENY_ALL_RESPONSE)}
      />
    )
  }
  return <ComputerUseAppListPanel request={request} onDone={onDone} />
}

// ── TCC panel ─────────────────────────────────────────────────────────────

type TccOption = 'open_accessibility' | 'open_screen_recording' | 'retry'

function ComputerUseTccPanel({
  tccState,
  onDone,
}: {
  tccState: NonNullable<CuPermissionRequest['tccState']>
  onDone: () => void
}): React.ReactNode {
  const t = useT()
  const opts: OptionWithDescription<TccOption>[] = []
  if (!tccState.accessibility) {
    opts.push({
      label: t('ui.permissions.computerUse.openAccessibility'),
      value: 'open_accessibility',
    })
  }
  if (!tccState.screenRecording) {
    opts.push({
      label: t('ui.permissions.computerUse.openScreenRecording'),
      value: 'open_screen_recording',
    })
  }
  opts.push({
    label: t('ui.permissions.computerUse.tryAgain'),
    value: 'retry',
  })

  function onChange(value: TccOption): void {
    switch (value) {
      case 'open_accessibility': {
        execFileNoThrow(
          'open',
          [
            'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
          ],
          { useCwd: false },
        )
        return
      }
      case 'open_screen_recording': {
        execFileNoThrow(
          'open',
          [
            'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
          ],
          { useCwd: false },
        )
        return
      }
      case 'retry': {
        onDone()
        return
      }
    }
  }

  const accessibilityStatus = tccState.accessibility
    ? `${figures.tick} ${t('ui.permissions.computerUse.granted')}`
    : `${figures.cross} ${t('ui.permissions.computerUse.notGranted')}`
  const screenRecordingStatus = tccState.screenRecording
    ? `${figures.tick} ${t('ui.permissions.computerUse.granted')}`
    : `${figures.cross} ${t('ui.permissions.computerUse.notGranted')}`

  return (
    <Dialog
      title={t('ui.permissions.computerUse.titleNeedsPermissions')}
      onCancel={onDone}
    >
      <Box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
        <Box flexDirection="column">
          <Text>
            {t('ui.permissions.computerUse.accessibilityLabel')}{' '}
            {accessibilityStatus}
          </Text>
          <Text>
            {t('ui.permissions.computerUse.screenRecordingLabel')}{' '}
            {screenRecordingStatus}
          </Text>
        </Box>
        <Text dimColor>{t('ui.permissions.computerUse.grantHint')}</Text>
        <Select options={opts} onChange={onChange} onCancel={onDone} />
      </Box>
    </Dialog>
  )
}

// ── App allowlist panel ───────────────────────────────────────────────────

type AppListOption = 'allow_all' | 'deny'

function ComputerUseAppListPanel({
  request,
  onDone,
}: ComputerUseApprovalProps): React.ReactNode {
  const t = useT()
  const SENTINEL_WARNING: Record<
    NonNullable<ReturnType<typeof getSentinelCategory>>,
    string
  > = {
    shell: t('ui.permissions.computerUse.sentinelShell'),
    filesystem: t('ui.permissions.computerUse.sentinelFilesystem'),
    system_settings: t('ui.permissions.computerUse.sentinelSystemSettings'),
  }

  const [checked] = useState(
    () =>
      new Set(
        request.apps.flatMap(a =>
          a.resolved && !a.alreadyGranted ? [a.resolved.bundleId] : [],
        ),
      ),
  )

  const ALL_FLAG_KEYS = [
    'clipboardRead',
    'clipboardWrite',
    'systemKeyCombos',
  ] as const
  const requestedFlagKeys = ALL_FLAG_KEYS.filter(k => request.requestedFlags[k])

  const allowKey =
    checked.size === 1
      ? 'ui.permissions.computerUse.allowForSessionOne'
      : 'ui.permissions.computerUse.allowForSessionMany'

  const options: OptionWithDescription<AppListOption>[] = [
    {
      label: t(allowKey, { count: checked.size }),
      value: 'allow_all',
    },
    {
      label: (
        <Text>
          {t('ui.permissions.computerUse.denyTellDifferent')}{' '}
          <Text bold>{t('ui.permissions.computerUse.escSuffix')}</Text>
        </Text>
      ),
      value: 'deny',
    },
  ]

  function respond(allow: boolean): void {
    if (!allow) {
      onDone(DENY_ALL_RESPONSE)
      return
    }
    const now = Date.now()
    const granted = request.apps.flatMap(a =>
      a.resolved && checked.has(a.resolved.bundleId)
        ? [
            {
              bundleId: a.resolved.bundleId,
              displayName: a.resolved.displayName,
              grantedAt: now,
            },
          ]
        : [],
    )
    const denied = request.apps
      .filter(
        a => !a.resolved || !checked.has(a.resolved.bundleId),
      )
      .map(a => ({
        bundleId: a.resolved?.bundleId ?? a.requestedName,
        reason: a.resolved
          ? ('user_denied' as const)
          : ('not_installed' as const),
      }))
    const flags = {
      ...DEFAULT_GRANT_FLAGS,
      ...Object.fromEntries(requestedFlagKeys.map(k => [k, true] as const)),
    }
    onDone({ granted, denied, flags })
  }

  const willHideKey =
    request.willHide && request.willHide.length === 1
      ? 'ui.permissions.computerUse.willHideOne'
      : 'ui.permissions.computerUse.willHideMany'

  return (
    <Dialog
      title={t('ui.permissions.computerUse.titleControlApps')}
      onCancel={() => respond(false)}
    >
      <Box flexDirection="column" paddingX={1} paddingY={1} gap={1}>
        {request.reason ? <Text dimColor>{request.reason}</Text> : null}
        <Box flexDirection="column">
          {request.apps.map(a => {
            const resolved = a.resolved
            if (!resolved) {
              return (
                <Text key={a.requestedName} dimColor>
                  {'  '}
                  {figures.circle} {a.requestedName}{' '}
                  <Text dimColor>
                    {t('ui.permissions.computerUse.notInstalled')}
                  </Text>
                </Text>
              )
            }
            if (a.alreadyGranted) {
              return (
                <Text key={resolved.bundleId} dimColor>
                  {'  '}
                  {figures.tick} {resolved.displayName}{' '}
                  <Text dimColor>
                    {t('ui.permissions.computerUse.alreadyGranted')}
                  </Text>
                </Text>
              )
            }
            const sentinel = getSentinelCategory(resolved.bundleId)
            const isChecked = checked.has(resolved.bundleId)
            return (
              <Box key={resolved.bundleId} flexDirection="column">
                <Text>
                  {'  '}
                  {isChecked ? figures.circleFilled : figures.circle}{' '}
                  {resolved.displayName}
                </Text>
                {sentinel ? (
                  <Text bold>
                    {'    '}
                    {figures.warning} {SENTINEL_WARNING[sentinel]}
                  </Text>
                ) : null}
              </Box>
            )
          })}
        </Box>
        {requestedFlagKeys.length > 0 ? (
          <Box flexDirection="column">
            <Text dimColor>
              {t('ui.permissions.computerUse.alsoRequested')}
            </Text>
            {requestedFlagKeys.map(flag => (
              <Text key={flag} dimColor>
                {'  '}· {flag}
              </Text>
            ))}
          </Box>
        ) : null}
        {request.willHide && request.willHide.length > 0 ? (
          <Text dimColor>
            {t(willHideKey, { count: request.willHide.length })}
          </Text>
        ) : null}
        <Select
          options={options}
          onChange={v => respond(v === 'allow_all')}
          onCancel={() => respond(false)}
        />
      </Box>
    </Dialog>
  )
}
