import { Page } from 'playwright';
import { extractQuestionFromDOM } from '../browser/extraction';
import { parseRawQuestion } from './question-parser';
import { QuestionInteractor } from '../browser/interactions';
import { MoodlePageController } from '../browser/moodle';
import { QuestionSolver } from '../llm/solver';
import { StateManager } from './state';
import { logger, logCli, formatTime } from '../utils/logger';
import { LLMQuizAnswer, QuestionExecutionResult } from './question-types';

export interface QuizExecutorOptions {
  dryRun: boolean;
  autoSubmit: boolean;
  warningTimeSeconds: number;
  criticalTimeSeconds: number;
  maxQuestions?: number;
}

export class QuizExecutor {
  private page: Page;
  private solver: QuestionSolver;
  private interactor: QuestionInteractor;
  private moodleController: MoodlePageController;
  private stateManager: StateManager;
  private options: QuizExecutorOptions;

  constructor(
    page: Page,
    solver: QuestionSolver,
    stateManager: StateManager,
    options: QuizExecutorOptions
  ) {
    this.page = page;
    this.solver = solver;
    this.interactor = new QuestionInteractor(page);
    this.moodleController = new MoodlePageController(
      page,
      options.warningTimeSeconds,
      options.criticalTimeSeconds
    );
    this.stateManager = stateManager;
    this.options = options;
  }

  /**
   * Executes the autonomous quiz loop until complete or time runs out.
   */
  public async run(): Promise<void> {
    logCli(`Starting Quiz Solver in ${this.options.dryRun ? 'DRY-RUN' : 'LIVE'} mode...`);
    let consecutiveErrors = 0;
    let totalProcessedThisRun = 0;

    while (true) {
      // Check timer
      const timerState = await this.moodleController.getTimerState();
      if (timerState.found) {
        if (timerState.totalSecondsRemaining <= 0) {
          logCli(`⚠️ Timer expired (${timerState.rawText}). Stopping solver.`);
          break;
        }
        if (timerState.isCritical) {
          logCli(`🚨 CRITICAL TIME WARNING: ${timerState.rawText} remaining! Disabling search and accelerating.`);
        } else if (timerState.isWarning) {
          logger.warn({ timer: timerState.rawText }, 'Timer warning threshold reached');
        }
      }

      // Check navigation state
      const navState = await this.moodleController.getNavigationState();

      if (navState.isSummaryPage || navState.isQuizFinished) {
        logCli('Summary or review page detected. All questions processed.');
        if (this.options.autoSubmit && !this.options.dryRun) {
          await this.moodleController.handleFinalSubmission();
          logCli('✅ Quiz submitted automatically.');
        } else {
          logCli('🛑 AUTO_SUBMIT is disabled (or dry-run). Please review and submit your quiz manually.');
        }
        break;
      }

      // Extract DOM Question
      const rawExtracted = await extractQuestionFromDOM(this.page);

      if (!rawExtracted.questionContainerFound) {
        // Maybe on summary page or intermediate page
        if (navState.isFinalQuestionPage || navState.isSummaryPage) {
          logCli('Reached the end of question items.');
          break;
        }

        consecutiveErrors++;
        if (consecutiveErrors > 3) {
          logCli('❌ Could not find question container 3 times consecutively. Aborting loop.');
          break;
        }
        logCli('Question container not detected, waiting 1s...');
        await this.page.waitForTimeout(1000);
        continue;
      }

      consecutiveErrors = 0;
      const question = parseRawQuestion(rawExtracted);

      const qNumStr = question.number ? `Question ${question.number}` : 'Current Question';
      logCli(`${qNumStr} detected`);
      logCli(`Type: ${question.type}`);

      let optCount = 0;
      if (question.type === 'single_choice' || question.type === 'true_false') {
        optCount = question.singleChoiceOptions?.length || 0;
      } else if (question.type === 'multiple_choice') {
        optCount = question.multipleChoiceOptions?.length || 0;
      } else if (question.type === 'matching') {
        optCount = question.matchingRows?.length || 0;
      }
      logCli(`Options / Rows: ${optCount}`);

      // Check if question was already processed
      if (this.stateManager.isQuestionAlreadyAnswered(question.hash)) {
        const prev = this.stateManager.getQuestionByHash(question.hash);
        logCli(`Question was previously answered (Status: ${prev?.status}). Skipping re-evaluation.`);
        if (!this.options.dryRun) {
          logCli('Navigating to next page...');
          await this.moodleController.clickNextPage(question.number);
          await this.page.waitForTimeout(500);
          continue;
        }
      }

      // Solve with LLM
      const isLowTime = timerState.isCritical;
      let solveResult;

      try {
        solveResult = await this.solver.solve(question, isLowTime);
      } catch (err: any) {
        logCli(`❌ Error solving question #${question.number}: ${err.message}`);
        const failedResult: QuestionExecutionResult = {
          questionNumber: question.number,
          questionHash: question.hash,
          type: question.type,
          answer: { type: 'single_choice', answer: '', confidence: 0, needs_search: false },
          confidence: 0,
          searched: false,
          status: 'failed',
          timestamp: new Date().toISOString(),
          latencyMs: 0,
          errorMessage: err.message
        };
        this.stateManager.recordQuestionResult(failedResult);

        if (!this.options.dryRun && navState.hasNextButton) {
          logCli('Skipping unresolved question and navigating next...');
          await this.moodleController.clickNextPage(question.number);
        }
        continue;
      }

      // Format answer for CLI display
      const answerDisplay = this.formatAnswerForDisplay(solveResult.answer);
      logCli(`LLM answer: ${answerDisplay}`);
      logCli(`Confidence: ${solveResult.confidence.toFixed(2)}`);
      logCli(`Search: ${solveResult.searched ? 'yes (' + (solveResult.searchQueries?.join(', ') || '') + ')' : 'no'}`);

      if (this.options.dryRun) {
        logCli('[DRY-RUN] Answer evaluated. No browser modifications made.');
        const dryRunResult: QuestionExecutionResult = {
          questionNumber: question.number,
          questionHash: question.hash,
          type: question.type,
          answer: solveResult.answer,
          confidence: solveResult.confidence,
          searched: solveResult.searched,
          searchQueries: solveResult.searchQueries,
          status: 'dry_run_evaluated',
          timestamp: new Date().toISOString(),
          latencyMs: solveResult.latencyMs
        };
        this.stateManager.recordQuestionResult(dryRunResult);
        totalProcessedThisRun++;

        if (this.options.maxQuestions && totalProcessedThisRun >= this.options.maxQuestions) {
          logCli(`Reached maximum requested questions limit (${this.options.maxQuestions}).`);
          break;
        }

        logCli('Dry-run complete for current question. In dry-run mode, solver stops after current page inspection.');
        break;
      }

      // Live Mode: Apply Interaction
      logCli('Selecting answers...');
      let interactionRes;

      if (question.type === 'single_choice' || question.type === 'true_false') {
        interactionRes = await this.interactor.applySingleChoice(question, solveResult.answer as any);
      } else if (question.type === 'multiple_choice') {
        interactionRes = await this.interactor.applyMultipleChoice(question, solveResult.answer as any);
      } else if (question.type === 'matching') {
        interactionRes = await this.interactor.applyMatching(question, solveResult.answer as any);
      } else {
        interactionRes = await this.interactor.applyTextInput(question, solveResult.answer as any);
      }

      if (!interactionRes.success) {
        logCli(`⚠️ Interaction warning: ${interactionRes.errors.join(', ')}`);
      }

      // Record state
      const successResult: QuestionExecutionResult = {
        questionNumber: question.number,
        questionHash: question.hash,
        type: question.type,
        answer: solveResult.answer,
        confidence: solveResult.confidence,
        searched: solveResult.searched,
        searchQueries: solveResult.searchQueries,
        status: interactionRes.success ? 'answered' : 'failed',
        timestamp: new Date().toISOString(),
        latencyMs: solveResult.latencyMs,
        errorMessage: interactionRes.errors.length > 0 ? interactionRes.errors.join('; ') : undefined
      };
      this.stateManager.recordQuestionResult(successResult);
      totalProcessedThisRun++;

      // Print Metrics Summary
      this.printMetrics(timerState.rawText);

      // Check max questions limit if specified
      if (this.options.maxQuestions && totalProcessedThisRun >= this.options.maxQuestions) {
        logCli(`Reached maximum question limit of ${this.options.maxQuestions}.`);
        break;
      }

      // Click Next Page
      logCli('Next page');
      try {
        await this.moodleController.clickNextPage(question.number);
      } catch (navErr: any) {
        logCli(`Navigation completed or reached final page: ${navErr.message}`);
        break;
      }

      // Brief delay to allow page render
      await this.page.waitForTimeout(400);
    }

    logCli('Solver finished run cycle.');
  }

  private formatAnswerForDisplay(answer: LLMQuizAnswer): string {
    if (answer.type === 'single_choice') {
      return answer.answer;
    } else if (answer.type === 'multiple_choice') {
      return answer.answers.join(', ');
    } else if (answer.type === 'matching') {
      return answer.matches.map(m => `[#${m.prompt_index} -> ${m.option_value}]`).join(', ');
    } else {
      return (answer as any).answer || '';
    }
  }

  private printMetrics(timerText?: string): void {
    const stats = this.stateManager.getSummaryStats();
    let msg = `Progress: ${stats.answered} answered | Speed: ${stats.questionsPerMin} q/min | Avg Latency: ${stats.avgLatencySec}s | Searches: ${stats.searches}`;
    if (timerText) {
      msg += ` | Timer: ${timerText}`;
    }
    console.log(`📊 ${msg}`);
  }
}
