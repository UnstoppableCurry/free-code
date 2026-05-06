import React from 'react'
import { Text } from '../ink.js'
import { useT } from '../i18n/context.js'
import { saveGlobalConfig } from '../utils/config.js'
import { Select } from './CustomSelect/index.js'
import { Dialog } from './design-system/Dialog.js'

type Props = {
  customApiKeyTruncated: string
  onDone(approved: boolean): void
}

export function ApproveApiKey({
  customApiKeyTruncated,
  onDone,
}: Props): React.ReactNode {
  const t = useT()

  function onChange(value: 'yes' | 'no') {
    switch (value) {
      case 'yes': {
        saveGlobalConfig(current => ({
          ...current,
          customApiKeyResponses: {
            ...current.customApiKeyResponses,
            approved: [
              ...(current.customApiKeyResponses?.approved ?? []),
              customApiKeyTruncated,
            ],
          },
        }))
        onDone(true)
        break
      }
      case 'no': {
        saveGlobalConfig(current => ({
          ...current,
          customApiKeyResponses: {
            ...current.customApiKeyResponses,
            rejected: [
              ...(current.customApiKeyResponses?.rejected ?? []),
              customApiKeyTruncated,
            ],
          },
        }))
        onDone(false)
        break
      }
    }
  }

  return (
    <Dialog
      title={t('dialog.approveApiKey.title')}
      color="warning"
      onCancel={() => onChange('no')}
    >
      <Text>
        <Text bold>ANTHROPIC_API_KEY</Text>
        <Text>: sk-ant-...{customApiKeyTruncated}</Text>
      </Text>
      <Text>{t('dialog.approveApiKey.question')}</Text>
      <Select
        defaultValue="no"
        defaultFocusValue="no"
        options={[
          { label: t('dialog.approveApiKey.yes'), value: 'yes' },
          {
            label: (
              <Text>
                {t('dialog.approveApiKey.noRecommended')} (
                <Text bold>{t('dialog.approveApiKey.recommended')}</Text>)
              </Text>
            ),
            value: 'no',
          },
        ]}
        onChange={value => onChange(value as 'yes' | 'no')}
        onCancel={() => onChange('no')}
      />
    </Dialog>
  )
}
