#!/usr/bin/env node
import { Command } from 'commander';
import { getConfig } from '../utils/config';
import { logger, logCli } from '../utils/logger';
import { BrowserConnector } from '../browser/connection';
import { MoodlePageController } from '../browser/moodle';
import { OpenAICompatibleClient } from '../llm/client';
import { QuestionSolver } from '../llm/solver';
import { StateManager } from '../quiz/state';
import { QuizExecutor } from '../quiz/executor';

const program = new Command();

program
  .name('moodle-solver')
  .description('AI-assisted Moodle quiz solver for authorized educational quizzes')
  .version('1.0.0');

// Global options
program
  .option('-c, --cdp-url <url>', 'Chrome/Brave remote debugging CDP URL (default: http://127.0.0.1:9222)')
  .option('-m, --model <name>', 'LLM model name (e.g. gpt-4o-mini)')
  .option('--confidence <threshold>', 'Confidence threshold for search fallback (0.0 - 1.0)')
  .option('--no-search', 'Disable web search fallback')
  .option('--debug', 'Enable debug logging');

/**
 * COMMAND: inspect
 * Connects to browser and prints sanitized diagnostic DOM representation.
 */
program
  .command('inspect')
  .description('Inspect current Moodle quiz DOM and print diagnostics without making any changes')
  .action(async (options, cmd) => {
    const parentOpts = cmd.parent?.opts() || {};
    const config = getConfig({
      BROWSER_CDP_URL: parentOpts.cdpUrl,
      LOG_LEVEL: parentOpts.debug ? 'debug' : undefined
    });

    logCli('Connecting to browser for DOM inspection...');
    let session;
    try {
      session = await BrowserConnector.connect({
        cdpUrl: config.BROWSER_CDP_URL,
        executablePath: config.BROWSER_EXECUTABLE_PATH,
        targetQuizUrl: config.TARGET_QUIZ_URL
      });

      const controller = new MoodlePageController(session.page);
      const report = await controller.generateDiagnosticReport();
      console.log(report);
    } catch (err: any) {
      logCli(`❌ Inspection failed: ${err.message}`);
    } finally {
      if (session) {
        await session.disconnect();
      }
    }
  });

/**
 * COMMAND: solve
 * Solves the quiz either in live mode or dry-run mode.
 */
program
  .command('solve')
  .description('Solve the Moodle quiz questions')
  .option('--dry-run', 'Evaluate answers without clicking or navigating', false)
  .option('--auto-submit', 'Automatically submit the quiz at the end (default: false)', false)
  .option('--max-questions <number>', 'Maximum questions to process in this run', (v) => parseInt(v, 10))
  .action(async (cmdOpts, cmd) => {
    const parentOpts = cmd.parent?.opts() || {};
    const config = getConfig({
      BROWSER_CDP_URL: parentOpts.cdpUrl,
      LLM_MODEL: parentOpts.model,
      CONFIDENCE_THRESHOLD: parentOpts.confidence ? parseFloat(parentOpts.confidence) : undefined,
      ENABLE_SEARCH: parentOpts.search !== false,
      AUTO_SUBMIT: cmdOpts.autoSubmit,
      LOG_LEVEL: parentOpts.debug ? 'debug' : undefined
    });

    if (!config.LLM_API_KEY) {
      logCli('⚠️ Warning: LLM_API_KEY is not set in environment or config. Please set it in .env');
    }

    logCli(`Connecting to browser via CDP (${config.BROWSER_CDP_URL})...`);
    let session;

    try {
      session = await BrowserConnector.connect({
        cdpUrl: config.BROWSER_CDP_URL,
        executablePath: config.BROWSER_EXECUTABLE_PATH,
        targetQuizUrl: config.TARGET_QUIZ_URL
      });

      const stateManager = new StateManager(config.STATE_FILE_PATH);

      const llmClient = new OpenAICompatibleClient({
        baseUrl: config.LLM_BASE_URL,
        apiKey: config.LLM_API_KEY,
        model: config.LLM_MODEL
      });

      const solver = new QuestionSolver(llmClient, {
        confidenceThreshold: config.CONFIDENCE_THRESHOLD,
        enableSearch: config.ENABLE_SEARCH,
        maxSearchResults: config.MAX_SEARCH_RESULTS
      });

      const executor = new QuizExecutor(session.page, solver, stateManager, {
        dryRun: cmdOpts.dryRun || false,
        autoSubmit: config.AUTO_SUBMIT,
        warningTimeSeconds: config.WARNING_TIME_SECONDS,
        criticalTimeSeconds: config.CRITICAL_TIME_SECONDS,
        maxQuestions: cmdOpts.maxQuestions
      });

      await executor.run();
    } catch (err: any) {
      logCli(`❌ Execution error: ${err.message}`);
    } finally {
      if (session) {
        await session.disconnect();
      }
    }
  });

/**
 * COMMAND: status
 * Displays current state, metrics, and questions answered.
 */
program
  .command('status')
  .description('Display progress statistics from the saved state file')
  .action(() => {
    const config = getConfig();
    const stateManager = new StateManager(config.STATE_FILE_PATH);
    const state = stateManager.getState();
    const stats = stateManager.getSummaryStats();

    console.log('\n=== MOODLE QUIZ SOLVER STATUS ===');
    console.log(`Session Started: ${state.startedAt}`);
    console.log(`Last Updated:    ${state.updatedAt}`);
    console.log(`Total Answered:  ${stats.answered}`);
    console.log(`Total Skipped:   ${stats.skipped}`);
    console.log(`Total Failed:    ${stats.failed}`);
    console.log(`Total Searches:  ${stats.searches}`);
    console.log(`Average Latency: ${stats.avgLatencySec}s (${stats.avgLatencyMs}ms)`);
    console.log(`Pacing Speed:    ${stats.questionsPerMin} questions/min`);
    console.log(`Last Question #: ${stats.lastQuestionNumber}`);
    console.log('=================================\n');
  });

/**
 * COMMAND: resume
 * Resumes execution using the saved state file.
 */
program
  .command('resume')
  .description('Resume quiz solving from previous crash or pause')
  .option('--auto-submit', 'Automatically submit the quiz at the end (default: false)', false)
  .action(async (cmdOpts, cmd) => {
    const parentOpts = cmd.parent?.opts() || {};
    const config = getConfig({
      BROWSER_CDP_URL: parentOpts.cdpUrl,
      LLM_MODEL: parentOpts.model,
      CONFIDENCE_THRESHOLD: parentOpts.confidence ? parseFloat(parentOpts.confidence) : undefined,
      ENABLE_SEARCH: parentOpts.search !== false,
      AUTO_SUBMIT: cmdOpts.autoSubmit,
      LOG_LEVEL: parentOpts.debug ? 'debug' : undefined
    });

    logCli('Resuming quiz execution from saved state...');
    let session;
    try {
      session = await BrowserConnector.connect({
        cdpUrl: config.BROWSER_CDP_URL,
        executablePath: config.BROWSER_EXECUTABLE_PATH,
        targetQuizUrl: config.TARGET_QUIZ_URL
      });

      const stateManager = new StateManager(config.STATE_FILE_PATH);
      const stats = stateManager.getSummaryStats();
      logCli(`Resuming session with ${stats.answered} previously answered questions.`);

      const llmClient = new OpenAICompatibleClient({
        baseUrl: config.LLM_BASE_URL,
        apiKey: config.LLM_API_KEY,
        model: config.LLM_MODEL
      });

      const solver = new QuestionSolver(llmClient, {
        confidenceThreshold: config.CONFIDENCE_THRESHOLD,
        enableSearch: config.ENABLE_SEARCH,
        maxSearchResults: config.MAX_SEARCH_RESULTS
      });

      const executor = new QuizExecutor(session.page, solver, stateManager, {
        dryRun: false,
        autoSubmit: config.AUTO_SUBMIT,
        warningTimeSeconds: config.WARNING_TIME_SECONDS,
        criticalTimeSeconds: config.CRITICAL_TIME_SECONDS
      });

      await executor.run();
    } catch (err: any) {
      logCli(`❌ Execution error during resume: ${err.message}`);
    } finally {
      if (session) {
        await session.disconnect();
      }
    }
  });

program.parse(process.argv);
