import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, Page } from 'playwright';
import { QuizExecutor } from '../../src/quiz/executor';
import { QuestionSolver } from '../../src/llm/solver';
import { StateManager } from '../../src/quiz/state';
import { OpenAICompatibleClient, LLMMessage } from '../../src/llm/client';
import { createSingleChoicePageHtml } from './moodle-mock-pages';
import fs from 'fs';

// Mock LLM Client that responds deterministically based on question contents
class MockLLMClient extends OpenAICompatibleClient {
  public failFirstAttempt = false;
  private attemptCount = 0;

  constructor() {
    super({ baseUrl: 'http://mock-llm', apiKey: 'mock-key', model: 'mock-model' });
  }

  public override async chatCompletion(messages: LLMMessage[]): Promise<string> {
    const userPrompt = messages.map(m => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content))).join('\n');
    this.attemptCount++;

    if (this.failFirstAttempt && this.attemptCount === 1) {
      // Return malformed JSON to test repair mechanism
      return 'Sorry, as an AI I am thinking {"answer": "not json"';
    }

    if (userPrompt.includes('Which protocol is used for securely transmitting')) {
      return JSON.stringify({
        type: 'single_choice',
        answer: 'q1_opt1',
        confidence: 0.98,
        needs_search: false,
        reason: 'HTTPS provides TLS encrypted HTTP communication'
      });
    }

    // Default fallback answer
    return JSON.stringify({
      type: 'single_choice',
      answer: 'q1_opt0',
      confidence: 0.8,
      needs_search: false
    });
  }
}

describe('End-to-End Quiz Executor Simulation', () => {
  let browser: Browser;
  let page: Page;
  const testStateFile = 'state/test-e2e-state.json';

  beforeAll(async () => {
    browser = await chromium.launch({
      executablePath: process.env.BROWSER_EXECUTABLE_PATH || '/usr/sbin/brave',
      headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });
    page = await browser.newPage();
  });

  afterAll(async () => {
    if (browser) await browser.close();
    if (fs.existsSync(testStateFile)) fs.unlinkSync(testStateFile);
  });

  it('executes in dry-run mode without modifying input states', async () => {
    if (fs.existsSync(testStateFile)) fs.unlinkSync(testStateFile);
    await page.setContent(createSingleChoicePageHtml(1));

    const mockClient = new MockLLMClient();
    const solver = new QuestionSolver(mockClient, {
      confidenceThreshold: 0.75,
      enableSearch: false
    });
    const stateManager = new StateManager(testStateFile);

    const executor = new QuizExecutor(page, solver, stateManager, {
      dryRun: true,
      autoSubmit: false,
      warningTimeSeconds: 600,
      criticalTimeSeconds: 180,
      maxQuestions: 1
    });

    await executor.run();

    // Verify radio input remained unchecked in dry run
    const isChecked = await page.isChecked('#q1_opt1');
    expect(isChecked).toBe(false);

    // State recorded evaluation
    const stats = stateManager.getSummaryStats();
    expect(stats.answered).toBe(1);
  });

  it('handles malformed initial response via repair retry', async () => {
    if (fs.existsSync(testStateFile)) fs.unlinkSync(testStateFile);
    await page.setContent(createSingleChoicePageHtml(1));

    const mockClient = new MockLLMClient();
    mockClient.failFirstAttempt = true; // First attempt is malformed

    const solver = new QuestionSolver(mockClient, {
      confidenceThreshold: 0.75,
      enableSearch: false
    });
    const stateManager = new StateManager(testStateFile);

    const executor = new QuizExecutor(page, solver, stateManager, {
      dryRun: false,
      autoSubmit: false,
      warningTimeSeconds: 600,
      criticalTimeSeconds: 180,
      maxQuestions: 1
    });

    await executor.run();

    // Radio should be checked following successful repair
    const isChecked = await page.isChecked('#q1_opt1');
    expect(isChecked).toBe(true);

    const stats = stateManager.getSummaryStats();
    expect(stats.answered).toBe(1);
  });
});
