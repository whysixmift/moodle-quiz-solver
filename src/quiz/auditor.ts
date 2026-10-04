import { Page } from 'playwright';
import { extractQuestionFromDOM } from '../browser/extraction';
import { parseRawQuestion } from './question-parser';
import { KnowledgeBase } from './knowledge-base';
import { QuestionSolver } from '../llm/solver';
import { QuestionInteractor } from '../browser/interactions';
import { MoodlePageController } from '../browser/moodle';
import { SingleChoiceAnswer, MultipleChoiceAnswer, MatchingAnswer, LLMQuizAnswer } from './question-types';
import { logger } from '../utils/logger';

export interface AuditSummary {
  totalEvaluated: number;
  verifiedCount: number;
  correctedCount: number;
  corrections: Array<{
    questionNo: number;
    type: string;
    description: string;
  }>;
}

export class QuizAuditor {
  private page: Page;
  private knowledgeBase: KnowledgeBase;
  private solver: QuestionSolver;
  private interactor: QuestionInteractor;
  private moodleController: MoodlePageController;

  constructor(
    page: Page,
    knowledgeBase: KnowledgeBase,
    solver: QuestionSolver,
    interactor: QuestionInteractor,
    moodleController: MoodlePageController
  ) {
    this.page = page;
    this.knowledgeBase = knowledgeBase;
    this.solver = solver;
    this.interactor = interactor;
    this.moodleController = moodleController;
  }

  /**
   * Evaluates questions backwards starting from current page down to Question 1.
   */
  public async auditBackward(): Promise<AuditSummary> {
    const summary: AuditSummary = {
      totalEvaluated: 0,
      verifiedCount: 0,
      correctedCount: 0,
      corrections: []
    };

    console.log('\n======================================================');
    console.log('🔍 STARTING BACKWARD QUIZ AUDIT & EVALUATION');
    console.log('======================================================\n');

    while (true) {
      const timerState = await this.moodleController.getTimerState();
      const rawExtracted = await extractQuestionFromDOM(this.page);

      if (!rawExtracted.questionContainerFound) {
        console.log('[AUDIT] Question container not detected on current page. Stopping.');
        break;
      }

      const question = parseRawQuestion(rawExtracted);
      const qNum = question.number ?? summary.totalEvaluated + 1;

      // 1. Get verified ground truth or LLM answer
      let expectedAnswer: LLMQuizAnswer | null = this.knowledgeBase.matchQuestion(question);
      let answerSource = 'Knowledge Base (Ground Truth)';

      if (!expectedAnswer) {
        try {
          const llmRes = await this.solver.solve(question, timerState.isCritical);
          expectedAnswer = llmRes.answer;
          answerSource = 'LLM Reasoning';
        } catch (err: any) {
          logger.error({ err: err.message, qNum }, 'Failed to solve question via LLM during audit');
        }
      }

      if (!expectedAnswer) {
        console.log(`[Q${qNum}] ⚠️ Unable to determine expected answer. Skipping.`);
      } else {
        summary.totalEvaluated++;

        // 2. Check current DOM state against expected answer
        let needsCorrection = false;
        let changeDescription = '';

        if (question.type === 'single_choice' || question.type === 'true_false') {
          const expected = expectedAnswer as SingleChoiceAnswer;
          const currentChecked = question.singleChoiceOptions?.find(o => o.isChecked);

          if (currentChecked?.id !== expected.answer) {
            needsCorrection = true;
            changeDescription = `Changed radio from '${currentChecked?.label.slice(0, 40) || 'None'}' to '${expected.answer}'`;
            await this.interactor.applySingleChoice(question, expected);
          }
        } else if (question.type === 'multiple_choice') {
          const expected = expectedAnswer as MultipleChoiceAnswer;
          const expectedSet = new Set(expected.answers);
          const currentCheckedOpts = (question.multipleChoiceOptions || []).filter(o => o.isChecked);
          const currentCheckedIds = new Set(currentCheckedOpts.map(o => o.id));

          let isSame = expectedSet.size === currentCheckedIds.size;
          if (isSame) {
            for (const id of expectedSet) {
              if (!currentCheckedIds.has(id)) {
                isSame = false;
                break;
              }
            }
          }

          if (!isSame) {
            needsCorrection = true;
            changeDescription = `Updated checkboxes: was [${currentCheckedOpts.map(o => o.label.slice(0, 30)).join(', ')}], now selecting ${expected.answers.length} verified options`;
            await this.interactor.applyMultipleChoice(question, expected);
          }
        } else if (question.type === 'matching') {
          const expected = expectedAnswer as MatchingAnswer;
          const rows = question.matchingRows || [];
          let hasMismatch = false;

          for (const match of expected.matches) {
            const row = rows.find(r => r.index === match.prompt_index);
            if (row && row.selectedValue !== match.option_value) {
              hasMismatch = true;
              break;
            }
          }

          if (hasMismatch) {
            needsCorrection = true;
            changeDescription = `Updated matching dropdowns to exact ground truth pairs`;
            await this.interactor.applyMatching(question, expected);
          }
        }

        if (needsCorrection) {
          summary.correctedCount++;
          summary.corrections.push({
            questionNo: qNum,
            type: question.type,
            description: changeDescription
          });
          console.log(`[Q${qNum}] 🔄 CORRECTED (${answerSource})`);
          console.log(`       └─ ${changeDescription}`);
        } else {
          summary.verifiedCount++;
          console.log(`[Q${qNum}] ✅ VERIFIED MATCH (${question.type}) [Timer: ${timerState.rawText}]`);
        }
      }

      // Check if time is running out (< 2 minutes)
      if (timerState.isCritical && timerState.totalSecondsRemaining < 120) {
        console.log(`\n⚠️ CRITICAL TIME WARNING: ${timerState.rawText} remaining. Stopping audit to protect submission.`);
        break;
      }

      // 3. Click Previous Page
      const hasPrev = await this.moodleController.clickPreviousPage();
      if (!hasPrev || qNum <= 1) {
        console.log('\n🏁 Reached the start of the quiz (Question 1). Audit complete!');
        break;
      }

      await this.page.waitForTimeout(200);
    }

    console.log('\n======================================================');
    console.log('📊 BACKWARD AUDIT SUMMARY REPORT');
    console.log('======================================================');
    console.log(`Total Questions Evaluated: ${summary.totalEvaluated}`);
    console.log(`✅ Verified Correct:        ${summary.verifiedCount}`);
    console.log(`🔄 Corrections Applied:     ${summary.correctedCount}`);
    if (summary.corrections.length > 0) {
      console.log('\nList of Corrections:');
      summary.corrections.forEach(c => {
        console.log(`  - Question #${c.questionNo} (${c.type}): ${c.description}`);
      });
    }
    console.log('======================================================\n');

    return summary;
  }
}
