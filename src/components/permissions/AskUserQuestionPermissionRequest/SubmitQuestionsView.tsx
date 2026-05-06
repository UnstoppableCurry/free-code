import figures from 'figures'
import React from 'react'
import { useT } from '../../../i18n/context.js'
import { Box, Text } from '../../../ink.js'
import type { Question } from '../../../tools/AskUserQuestionTool/AskUserQuestionTool.js'
import type { PermissionDecision } from '../../../utils/permissions/PermissionResult.js'
import { Select } from '../../CustomSelect/index.js'
import { Divider } from '../../design-system/Divider.js'
import { PermissionRequestTitle } from '../PermissionRequestTitle.js'
import { PermissionRuleExplanation } from '../PermissionRuleExplanation.js'
import { QuestionNavigationBar } from './QuestionNavigationBar.js'

type Props = {
  questions: Question[]
  currentQuestionIndex: number
  answers: Record<string, string>
  allQuestionsAnswered: boolean
  permissionResult: PermissionDecision
  minContentHeight?: number
  onFinalResponse: (value: 'submit' | 'cancel') => void
}

export function SubmitQuestionsView({
  questions,
  currentQuestionIndex,
  answers,
  allQuestionsAnswered,
  permissionResult,
  minContentHeight,
  onFinalResponse,
}: Props): React.ReactNode {
  const t = useT()
  return (
    <Box flexDirection="column" marginTop={1}>
      <Divider color="inactive" />
      <Box
        flexDirection="column"
        borderTop
        borderColor="inactive"
        paddingTop={0}
      >
        <QuestionNavigationBar
          questions={questions}
          currentQuestionIndex={currentQuestionIndex}
          answers={answers}
        />
        <PermissionRequestTitle
          title={t('ui.permissions.askUserQuestion.reviewYourAnswers')}
          color="text"
        />
        <Box flexDirection="column" marginTop={1} minHeight={minContentHeight}>
          {!allQuestionsAnswered && (
            <Box marginBottom={1}>
              <Text color="warning">
                {figures.warning}{' '}
                {t('ui.permissions.askUserQuestion.notAllAnswered')}
              </Text>
            </Box>
          )}
          {Object.keys(answers).length > 0 && (
            <Box flexDirection="column" marginBottom={1}>
              {questions
                .filter((q: Question) => q?.question && answers[q.question])
                .map((q: Question) => {
                  const answer = answers[q?.question]
                  return (
                    <Box
                      key={q?.question || 'answer'}
                      flexDirection="column"
                      marginLeft={1}
                    >
                      <Text>
                        {figures.bullet}{' '}
                        {q?.question ||
                          t('ui.permissions.askUserQuestion.questionFallback')}
                      </Text>
                      <Box marginLeft={2}>
                        <Text color="success">
                          {figures.arrowRight} {answer}
                        </Text>
                      </Box>
                    </Box>
                  )
                })}
            </Box>
          )}

          <PermissionRuleExplanation
            permissionResult={permissionResult}
            toolType="tool"
          />
          <Text color="inactive">
            {t('ui.permissions.askUserQuestion.readyToSubmit')}
          </Text>
          <Box marginTop={1}>
            <Select
              options={[
                {
                  type: 'text' as const,
                  label: t('ui.permissions.askUserQuestion.submitAnswers'),
                  value: 'submit',
                },
                {
                  type: 'text' as const,
                  label: t('ui.permissions.askUserQuestion.cancel'),
                  value: 'cancel',
                },
              ]}
              onChange={value =>
                onFinalResponse(value as 'submit' | 'cancel')
              }
              onCancel={() => onFinalResponse('cancel')}
            />
          </Box>
        </Box>
      </Box>
    </Box>
  )
}
