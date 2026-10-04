import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { chromium, Browser, Page } from 'playwright';
import { extractQuestionFromDOM } from '../../src/browser/extraction';
import { QuestionInteractor } from '../../src/browser/interactions';
import { MoodlePageController } from '../../src/browser/moodle';
import { parseRawQuestion } from '../../src/quiz/question-parser';
import {
  createSingleChoicePageHtml,
  createMultipleChoicePageHtml,
  createMatchingPageHtml,
  createTrueFalsePageHtml,
  createSummaryPageHtml
} from './moodle-mock-pages';

describe('Playwright DOM Extraction and Interaction against Mock Moodle HTML', () => {
  let browser: Browser;
  let page: Page;

  beforeAll(async () => {
    browser = await chromium.launch({
      executablePath: process.env.BROWSER_EXECUTABLE_PATH || '/usr/sbin/brave',
      headless: true,
      args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage']
    });
    page = await browser.newPage();
  });

  afterAll(async () => {
    if (browser) {
      await browser.close();
    }
  });

  it('correctly extracts and solves Single Choice question', async () => {
    await page.setContent(createSingleChoicePageHtml(1));

    const raw = await extractQuestionFromDOM(page);
    expect(raw.questionContainerFound).toBe(true);
    expect(raw.questionNumber).toBe(1);
    expect(raw.inferredType).toBe('single_choice');
    expect(raw.options).toHaveLength(4);
    expect(raw.questionText).toContain('Which protocol is used for securely');

    const parsed = parseRawQuestion(raw);
    expect(parsed.singleChoiceOptions).toHaveLength(4);

    const interactor = new QuestionInteractor(page);
    const actionRes = await interactor.applySingleChoice(parsed, {
      type: 'single_choice',
      answer: 'q1_opt1', // HTTPS
      confidence: 0.99,
      needs_search: false
    });

    expect(actionRes.success).toBe(true);

    // Verify checked status in page
    const isChecked = await page.isChecked('#q1_opt1');
    expect(isChecked).toBe(true);
  });

  it('correctly extracts and solves Multiple Choice question with Indonesian locale', async () => {
    await page.setContent(createMultipleChoicePageHtml(2));

    const raw = await extractQuestionFromDOM(page);
    expect(raw.questionContainerFound).toBe(true);
    expect(raw.questionNumber).toBe(2);
    expect(raw.inferredType).toBe('multiple_choice');
    expect(raw.options).toHaveLength(4);

    const parsed = parseRawQuestion(raw);
    const interactor = new QuestionInteractor(page);

    const actionRes = await interactor.applyMultipleChoice(parsed, {
      type: 'multiple_choice',
      answers: ['q2_cb0', 'q2_cb1', 'q2_cb3'], // App, Trans, Internet
      confidence: 0.95,
      needs_search: false
    });

    expect(actionRes.success).toBe(true);

    expect(await page.isChecked('#q2_cb0')).toBe(true);
    expect(await page.isChecked('#q2_cb1')).toBe(true);
    expect(await page.isChecked('#q2_cb2')).toBe(false);
    expect(await page.isChecked('#q2_cb3')).toBe(true);
  });

  it('correctly extracts and solves Matching Dropdown question', async () => {
    await page.setContent(createMatchingPageHtml(3));

    const raw = await extractQuestionFromDOM(page);
    expect(raw.questionContainerFound).toBe(true);
    expect(raw.questionNumber).toBe(3);
    expect(raw.inferredType).toBe('matching');
    expect(raw.matchingRows).toHaveLength(3);

    expect(raw.matchingRows[0].promptText).toContain('Managed Ethernet Switch');
    expect(raw.matchingRows[1].promptText).toContain('IP Router');
    expect(raw.matchingRows[2].promptText).toContain('Passive Ethernet Hub');

    const parsed = parseRawQuestion(raw);
    const interactor = new QuestionInteractor(page);

    const actionRes = await interactor.applyMatching(parsed, {
      type: 'matching',
      matches: [
        { prompt_index: 0, option_value: 'layer2' }, // Switch -> Layer 2
        { prompt_index: 1, option_value: 'layer3' }, // Router -> Layer 3
        { prompt_index: 2, option_value: 'layer1' }  // Hub -> Layer 1
      ],
      confidence: 0.98,
      needs_search: false
    });

    expect(actionRes.success).toBe(true);

    const val0 = await page.$eval('#menuq3_sub0', (el) => (el as HTMLSelectElement).value);
    const val1 = await page.$eval('#menuq3_sub1', (el) => (el as HTMLSelectElement).value);
    const val2 = await page.$eval('#menuq3_sub2', (el) => (el as HTMLSelectElement).value);

    expect(val0).toBe('layer2');
    expect(val1).toBe('layer3');
    expect(val2).toBe('layer1');
  });

  it('extracts Moodle Timer and determines Warning / Critical thresholds', async () => {
    await page.setContent(createSingleChoicePageHtml(1));

    const controller = new MoodlePageController(page, 600, 180);
    const timerState = await controller.getTimerState();

    expect(timerState.found).toBe(true);
    expect(timerState.rawText).toContain('00:48:15');
    expect(timerState.totalSecondsRemaining).toBe(48 * 60 + 15);
    expect(timerState.isWarning).toBe(false);
    expect(timerState.isCritical).toBe(false);
  });

  it('detects navigation states and finish attempt buttons', async () => {
    await page.setContent(createTrueFalsePageHtml(4));

    const controller = new MoodlePageController(page);
    const navState = await controller.getNavigationState();

    expect(navState.hasNextButton).toBe(false);
    expect(navState.isFinalQuestionPage).toBe(true);
  });
});
