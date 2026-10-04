import { chromium, Browser, BrowserContext, Page } from 'playwright';
import { logger } from '../utils/logger';

export interface BrowserConnectionOptions {
  cdpUrl?: string;
  executablePath?: string;
  targetQuizUrl?: string;
  userDataDir?: string;
}

export interface ConnectedSession {
  browser?: Browser;
  context: BrowserContext;
  page: Page;
  isCdp: boolean;
  disconnect: () => Promise<void>;
}

export class BrowserConnector {
  /**
   * Connects to an existing Chrome/Brave session via CDP or falls back to persistent context.
   */
  public static async connect(options: BrowserConnectionOptions): Promise<ConnectedSession> {
    const cdpUrl = options.cdpUrl || 'http://127.0.0.1:9222';
    const targetQuizUrl = options.targetQuizUrl || 'mod/quiz';

    logger.info({ cdpUrl }, 'Attempting CDP connection to running Brave/Chromium session...');

    try {
      // 1. Connect over CDP
      const browser = await chromium.connectOverCDP(cdpUrl, { timeout: 8000 });
      const contexts = browser.contexts();
      const context = contexts[0] || (await browser.newContext());
      const pages = context.pages();

      logger.info({ openTabsCount: pages.length }, 'Connected to browser via CDP');

      // Find Moodle quiz tab
      let targetPage: Page | undefined;

      for (const p of pages) {
        const url = p.url();
        if (url.includes('attempt.php') || url.includes('mod/quiz') || url.includes('lms.onnocenter.or.id')) {
          targetPage = p;
          logger.info({ url }, 'Located active Moodle quiz tab');
          break;
        }
      }

      if (!targetPage) {
        if (pages.length > 0) {
          targetPage = pages[0];
          logger.warn({ url: targetPage.url() }, 'Target quiz tab not explicitly matched, using first tab');
        } else {
          targetPage = await context.newPage();
          if (options.targetQuizUrl) {
            await targetPage.goto(options.targetQuizUrl);
          }
        }
      }

      // Ensure page is brought to front
      await targetPage.bringToFront().catch(() => null);

      return {
        browser,
        context,
        page: targetPage,
        isCdp: true,
        disconnect: async () => {
          logger.debug('Closing CDP browser connection');
          await browser.close().catch(() => null);
        }
      };
    } catch (cdpErr: any) {
      logger.warn(
        { err: cdpErr.message },
        'CDP connection failed. Note: Ensure Brave/Chrome is running with --remote-debugging-port=9222'
      );

      // Fallback: Launch persistent context with Brave
      logger.info('Attempting fallback: Launching persistent browser context with Brave...');
      const userDataDir = options.userDataDir || '/tmp/brave-moodle-profile';
      const executablePath = options.executablePath || '/usr/sbin/brave';

      const context = await chromium.launchPersistentContext(userDataDir, {
        executablePath,
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });

      const pages = context.pages();
      const page = pages[0] || (await context.newPage());

      if (options.targetQuizUrl && !page.url().includes('mod/quiz')) {
        await page.goto(options.targetQuizUrl);
      }

      return {
        context,
        page,
        isCdp: false,
        disconnect: async () => {
          logger.debug('Closing persistent browser context');
          await context.close().catch(() => null);
        }
      };
    }
  }
}
