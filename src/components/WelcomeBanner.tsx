import React from 'react'
import { Box, Text } from 'ink'
import { useT } from '../i18n/context.js'

export function WelcomeBanner(props: { model: string }) {
  const t = useT()
  return (
    <Box flexDirection="column">
      <Text bold>{t('welcome.title')}</Text>
      <Text>{t('welcome.subtitle', { model: props.model })}</Text>
    </Box>
  )
}
