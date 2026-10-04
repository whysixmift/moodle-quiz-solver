import { Page } from 'playwright';
import { MOODLE_SELECTORS } from './selectors';
import { MoodleTimerState, NavigationState, RawExtractedQuestion } from '../quiz/question-types';
import { extractQuestionFromDOM } from './extraction';
import { logger } from '../utils/logger';

export class MoodlePageController {
  private page: Page;
  private warningSeconds: number;
  private criticalSeconds: number;

  constructor(page: Page, warningSeconds = 600, criticalSeconds = 180) {
    this.page = page;
    this.warningSeconds = warningSeconds;
    this.criticalSeconds = criticalSeconds;
  }

  /**
   * Reads Moodle countdown timer from DOM.
   */
  public async getTimerState(): Promise<MoodleTimerState> {
    const timerData = await this.page.evaluate((selectors) => {
      let rawText = '';
      for (const sel of selectors) {
        try {
          const el = document.querySelector(sel);
          if (el && el.textContent) {
            rawText = el.textContent.trim();
            break;
          }
        } catch {
          // ignore selector errors
        }
      }

      if (!rawText) {
        // Search body for time format hh:mm:ss or mm:ss
        const match = document.body.innerText.match(/Time left\s*([\d:]+)|Waktu tersisa\s*([\d:]+)|Sisa waktu\s*([\d:]+)/i);
        if (match) {
          rawText = match[1] || match[2] || match[3] || '';
        }
      }

      return rawText;
    }, MOODLE_SELECTORS.TIMER);

    if (!timerData) {
      return {
        found: false,
        rawText: '',
        totalSecondsRemaining: 3600, // default assumed safe 60 mins
        isWarning: false,
        isCritical: false
      };
    }

    // Parse hh:mm:ss or mm:ss
    const parts = timerData.match(/\d+/g);
    let totalSeconds = 3600;

    if (parts) {
      if (parts.length === 3) {
        // hh:mm:ss
        totalSeconds = parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
      } else if (parts.length === 2) {
        // mm:ss
        totalSeconds = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
      } else if (parts.length === 1) {
        totalSeconds = parseInt(parts[0], 10);
      }
    }

    return {
      found: true,
      rawText: timerData,
      totalSecondsRemaining: totalSeconds,
      isWarning: totalSeconds <= this.warningSeconds,
      isCritical: totalSeconds <= this.criticalSeconds
    };
  }

  /**
   * Determines navigation state and whether we are on a question page, summary page, or end.
   */
  public async getNavigationState(): Promise<NavigationState> {
    return await this.page.evaluate((selectors) => {
      const currentUrl = window.location.href;
      const isSummary = currentUrl.includes('summary.php');
      const isReview = currentUrl.includes('review.php');

      // Check Finish attempt button first
      let hasFinish = false;
      for (const sel of selectors.NAV_FINISH_ATTEMPT) {
        try {
          const el = document.querySelector(sel);
          if (el && (el as HTMLElement).offsetParent !== null) {
            hasFinish = true;
            break;
          }
        } catch {
          // continue
        }
      }

      // Check general buttons containing finish / submit text
      if (!hasFinish) {
        const buttons = Array.from(document.querySelectorAll('input[type="submit"], button, a.btn'));
        for (const b of buttons) {
          const txt = ((b.textContent || '') + ' ' + ((b as HTMLInputElement).value || '')).toLowerCase();
          if (txt.includes('finish attempt') || txt.includes('selesaikan kuis') || txt.includes('kumpulkan')) {
            hasFinish = true;
            break;
          }
        }
      }

      // Check Next button
      let hasNext = false;
      let nextSelector: string | undefined;
      for (const sel of selectors.NAV_NEXT) {
        try {
          const el = document.querySelector(sel);
          if (el && (el as HTMLElement).offsetParent !== null) {
            const val = (((el as HTMLInputElement).value || '') + ' ' + (el.textContent || '')).toLowerCase();
            if (!val.includes('finish') && !val.includes('selesaikan')) {
              hasNext = true;
              nextSelector = sel;
              break;
            }
          }
        } catch {
          // continue
        }
      }

      // Check Previous button
      let hasPrev = false;
      for (const sel of selectors.NAV_PREV) {
        try {
          const el = document.querySelector(sel);
          if (el && (el as HTMLElement).offsetParent !== null) {
            hasPrev = true;
            break;
          }
        } catch {
          // continue
        }
      }

      return {
        hasPreviousButton: hasPrev,
        hasNextButton: hasNext,
        isFinalQuestionPage: !hasNext && hasFinish,
        isSummaryPage: isSummary,
        isQuizFinished: isReview,
        nextButtonSelector: nextSelector
      };
    }, MOODLE_SELECTORS);
  }

  /**
   * Clicks Next page and waits for DOM update.
   */
  public async clickNextPage(expectedCurrentQuestionNo?: number): Promise<boolean> {
    logger.debug('Attempting navigation to next page');

    let clicked = false;

    for (const sel of MOODLE_SELECTORS.NAV_NEXT) {
      try {
        const loc = this.page.locator(sel);
        if (await loc.count() > 0 && await loc.first().isVisible()) {
          const btnText = (await loc.first().inputValue().catch(() => '')) || (await loc.first().textContent().catch(() => '')) || '';
          if (!btnText.toLowerCase().includes('finish') && !btnText.toLowerCase().includes('selesaikan')) {
            await Promise.all([
              this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
              loc.first().click()
            ]);
            clicked = true;
            break;
          }
        }
      } catch {
        // continue
      }
    }

    if (!clicked) {
      // Fallback: look for finish attempt if it's the last page
      for (const sel of MOODLE_SELECTORS.NAV_FINISH_ATTEMPT) {
        try {
          const loc = this.page.locator(sel);
          if (await loc.count() > 0 && await loc.first().isVisible()) {
            logger.info('Finish attempt button encountered');
            await Promise.all([
              this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
              loc.first().click()
            ]);
            clicked = true;
            break;
          }
        } catch {
          // continue
        }
      }
    }

    if (!clicked) {
      throw new Error('Could not find any visible Next Page or Finish button on the page');
    }

    // Small delay to ensure render stability
    await this.page.waitForTimeout(400);

    return true;
  }

  /**
   * Clicks Previous page and waits for DOM update.
   */
  public async clickPreviousPage(): Promise<boolean> {
    logger.debug('Attempting navigation to previous page');

    let clicked = false;

    for (const sel of MOODLE_SELECTORS.NAV_PREV) {
      try {
        const loc = this.page.locator(sel);
        if (await loc.count() > 0 && await loc.first().isVisible()) {
          await Promise.all([
            this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
            loc.first().click()
          ]);
          clicked = true;
          break;
        }
      } catch {
        // continue
      }
    }

    if (!clicked) {
      return false;
    }

    await this.page.waitForTimeout(300);
    return true;
  }

  /**
   * Handles final submission if AUTO_SUBMIT=true.
   */
  public async handleFinalSubmission(): Promise<boolean> {
    logger.info('Handling final quiz submission (AUTO_SUBMIT is active)...');

    // 1. If on summary page, click "Submit all and finish"
    for (const sel of MOODLE_SELECTORS.NAV_SUBMIT_ALL) {
      try {
        const loc = this.page.locator(sel);
        if (await loc.count() > 0 && await loc.first().isVisible()) {
          await loc.first().click();
          await this.page.waitForTimeout(500);
          break;
        }
      } catch {
        // continue
      }
    }

    // 2. Confirm modal popup if present
    for (const sel of MOODLE_SELECTORS.MODAL_CONFIRM) {
      try {
        const loc = this.page.locator(sel);
        if (await loc.count() > 0 && await loc.first().isVisible()) {
          await Promise.all([
            this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => null),
            loc.first().click()
          ]);
          logger.info('Confirmed final submission dialog');
          return true;
        }
      } catch {
        // continue
      }
    }

    return true;
  }

  /**
   * Diagnostic DOM Inspection representation.
   */
  public async generateDiagnosticReport(): Promise<string> {
    const rawQ: RawExtractedQuestion = await extractQuestionFromDOM(this.page);
    const timer = await this.getTimerState();
    const nav = await this.getNavigationState();
    const pageUrl = this.page.url();

    let out = `\n=== MOODLE DOM DIAGNOSTIC REPORT ===\n`;
    out += `Page URL: ${pageUrl}\n`;
    out += `Timer: ${timer.found ? timer.rawText + ` (${timer.totalSecondsRemaining}s)` : 'Not detected'}\n`;
    out += `Container Found: ${rawQ.questionContainerFound}\n`;
    out += `Detected Question #: ${rawQ.questionNumber ?? 'Unknown'}\n`;
    out += `Detected Type: ${rawQ.inferredType}\n`;
    out += `Question Text: ${rawQ.questionText || '(none)'}\n`;
    out += `Instructions: ${rawQ.instructionText || '(none)'}\n`;

    if (rawQ.options.length > 0) {
      out += `\nChoice Controls (${rawQ.options.length} found):\n`;
      rawQ.options.forEach((opt, idx) => {
        out += `  [${idx}] ID: "${opt.id}" | Name: "${opt.inputName}" | Value: "${opt.value}" | Checked: ${opt.isChecked}\n`;
        out += `      Label: "${opt.label}"\n`;
      });
    }

    if (rawQ.matchingRows.length > 0) {
      out += `\nMatching Controls (${rawQ.matchingRows.length} prompt rows found):\n`;
      rawQ.matchingRows.forEach((row) => {
        out += `  [Row ${row.index}] Prompt: "${row.promptText}"\n`;
        out += `      Select ID: "${row.selectId}" | Name: "${row.selectName}" | Current: "${row.selectedValue}"\n`;
        out += `      Available Options (${row.options.length}):\n`;
        row.options.forEach(opt => {
          out += `        - Value: "${opt.value}" | Label: "${opt.label}"\n`;
        });
      });
    }

    if (rawQ.images.length > 0) {
      out += `\nImages (${rawQ.images.length} found):\n`;
      rawQ.images.forEach((img, idx) => {
        out += `  [Img ${idx}] Src: ${img.src} | Alt: "${img.alt}"\n`;
      });
    }

    out += `\nNavigation Buttons Detected:\n`;
    out += `  Previous Button: ${nav.hasPreviousButton ? 'Found' : 'Not found'}\n`;
    out += `  Next Button: ${nav.hasNextButton ? 'Found' : 'Not found'}\n`;
    out += `  Finish Attempt Page/Button: ${nav.isFinalQuestionPage ? 'Found' : 'Not found'}\n`;
    out += `  Summary Page: ${nav.isSummaryPage ? 'Yes' : 'No'}\n`;
    out += `====================================\n`;

    return out;
  }
}
