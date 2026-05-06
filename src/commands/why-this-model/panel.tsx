import React from 'react'
import { Box, Text } from '../../ink.js'
import { useT } from '../../i18n/context.js'
import { getRecentDecisions } from '../../routing/decisionLog.js'

/**
 * Visual panel for /why-this-model. Reads the in-memory decision log and
 * renders one row per recent decision.
 *
 * Kept deliberately simple — no scroll, no truncation — because the log is
 * capped at 10 entries by decisionLog.ts.
 */
export function WhyThisModelPanel(): React.ReactElement {
  const t = useT()
  const entries = getRecentDecisions()

  if (entries.length === 0) {
    return (
      <Box flexDirection="column">
        <Text dimColor>{t('command.whyThisModel.empty')}</Text>
      </Box>
    )
  }

  return (
    <Box flexDirection="column">
      <Text bold>{t('command.whyThisModel.title')}</Text>
      {entries.map((e, i) => (
        <Box key={i} flexDirection="column" marginTop={1}>
          <Text>
            <Text color="cyan">{e.decision.model.id}</Text>
            {'  '}
            <Text dimColor>
              [{e.decision.source}: {e.decision.tier}]
            </Text>
          </Text>
          {e.decision.reasons.map((r, j) => (
            <Text key={j} dimColor>
              {'  - '}
              {r}
            </Text>
          ))}
        </Box>
      ))}
    </Box>
  )
}
