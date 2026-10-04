import { Page } from 'playwright';
import { ParsedQuestion, SingleChoiceAnswer, MultipleChoiceAnswer, MatchingAnswer, TextAnswer } from '../quiz/question-types';
import { escapeCssSelector } from './selectors';
import { logger } from '../utils/logger';

export interface InteractionResult {
  success: boolean;
  actionSummary: string;
  errors: string[];
}

export class QuestionInteractor {
  private page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  /**
   * Applies single-choice radio selection.
   */
  public async applySingleChoice(
    question: ParsedQuestion,
    answer: SingleChoiceAnswer
  ): Promise<InteractionResult> {
    const targetOptionId = answer.answer;
    const option = question.singleChoiceOptions?.find(
      (opt) => opt.id === targetOptionId || opt.value === targetOptionId
    );

    if (!option) {
      return {
        success: false,
        actionSummary: `Failed to find radio option '${targetOptionId}'`,
        errors: [`Option '${targetOptionId}' not found in DOM options list`]
      };
    }

    try {
      let clicked = false;

      // 1. Try selecting by input ID
      if (option.id) {
        const inputLocator = this.page.locator(`input#${escapeCssSelector(option.id)}`);
        if (await inputLocator.count() > 0) {
          await inputLocator.first().check({ force: true });
          clicked = true;
        }
      }

      // 2. Try selecting by name and value
      if (!clicked && option.inputName && option.value) {
        const nameValLocator = this.page.locator(`input[name="${option.inputName}"][value="${option.value}"]`);
        if (await nameValLocator.count() > 0) {
          await nameValLocator.first().check({ force: true });
          clicked = true;
        }
      }

      // 3. Try clicking associated label
      if (!clicked && option.id) {
        const labelLocator = this.page.locator(`label[for="${escapeCssSelector(option.id)}"]`);
        if (await labelLocator.count() > 0) {
          await labelLocator.first().click();
          clicked = true;
        }
      }

      // 4. Fallback: evaluate in DOM directly
      if (!clicked) {
        await this.page.evaluate(({ id, name, val }) => {
          let el = document.getElementById(id) as HTMLInputElement | null;
          if (!el) {
            el = document.querySelector(`input[name="${name}"][value="${val}"]`) as HTMLInputElement | null;
          }
          if (el) {
            el.checked = true;
            el.dispatchEvent(new Event('change', { bubbles: true }));
          }
        }, { id: option.id, name: option.inputName, val: option.value });
      }

      // 5. Verify selection in DOM
      const isSelected = await this.page.evaluate(
        ({ id, name, val }) => {
          let el = document.getElementById(id) as HTMLInputElement | null;
          if (!el) {
            el = document.querySelector(`input[name="${name}"][value="${val}"]`) as HTMLInputElement | null;
          }
          return el ? el.checked : false;
        },
        { id: option.id, name: option.inputName, val: option.value }
      );

      if (!isSelected) {
        throw new Error(`Verification failed: radio button '${option.id}' is not checked after action`);
      }

      return {
        success: true,
        actionSummary: `Selected radio option [${option.id}] (${option.label.slice(0, 30)})`,
        errors: []
      };
    } catch (err: any) {
      logger.error({ err: err.message, optionId: option.id }, 'Error applying single choice selection');
      return {
        success: false,
        actionSummary: 'Error selecting radio button',
        errors: [err.message]
      };
    }
  }

  /**
   * Applies multiple-choice checkbox selections.
   */
  public async applyMultipleChoice(
    question: ParsedQuestion,
    answer: MultipleChoiceAnswer
  ): Promise<InteractionResult> {
    const desiredAnswerIds = new Set(answer.answers);
    const options = question.multipleChoiceOptions || [];
    const errors: string[] = [];

    try {
      for (const opt of options) {
        const shouldBeChecked = desiredAnswerIds.has(opt.id) || desiredAnswerIds.has(opt.value);

        // Find locator
        let inputLocator = this.page.locator(`input#${escapeCssSelector(opt.id)}`);
        if (await inputLocator.count() === 0 && opt.inputName) {
          inputLocator = this.page.locator(`input[name="${opt.inputName}"][value="${opt.value}"]`);
        }

        if (await inputLocator.count() > 0) {
          if (shouldBeChecked) {
            await inputLocator.first().check({ force: true });
          } else {
            await inputLocator.first().uncheck({ force: true });
          }
        } else {
          // Label fallback
          const labelLocator = this.page.locator(`label[for="${escapeCssSelector(opt.id)}"]`);
          if (await labelLocator.count() > 0) {
            const currentChecked = await this.page.evaluate(
              ({ id, name, val }) => {
                let el = document.getElementById(id) as HTMLInputElement | null;
                if (!el) el = document.querySelector(`input[name="${name}"][value="${val}"]`) as HTMLInputElement | null;
                return el ? el.checked : false;
              },
              { id: opt.id, name: opt.inputName, val: opt.value }
            );

            if (currentChecked !== shouldBeChecked) {
              await labelLocator.first().click();
            }
          }
        }
      }

      // Verify all checkboxes
      const verification = await this.page.evaluate(
        (opts) => {
          return opts.map((opt) => {
            let el = document.getElementById(opt.id) as HTMLInputElement | null;
            if (!el) el = document.querySelector(`input[name="${opt.inputName}"][value="${opt.value}"]`) as HTMLInputElement | null;
            return { id: opt.id, checked: el ? el.checked : false };
          });
        },
        options
      );

      for (const opt of options) {
        const expected = desiredAnswerIds.has(opt.id) || desiredAnswerIds.has(opt.value);
        const actual = verification.find((v) => v.id === opt.id)?.checked ?? false;
        if (expected !== actual) {
          errors.push(`Checkbox '${opt.id}' expected checked=${expected}, but found checked=${actual}`);
        }
      }

      if (errors.length > 0) {
        return {
          success: false,
          actionSummary: 'Checkbox state verification failed',
          errors
        };
      }

      return {
        success: true,
        actionSummary: `Selected ${answer.answers.length} checkbox options`,
        errors: []
      };
    } catch (err: any) {
      logger.error({ err: err.message }, 'Error applying multiple choice selections');
      return {
        success: false,
        actionSummary: 'Error selecting checkboxes',
        errors: [err.message]
      };
    }
  }

  /**
   * Applies matching dropdown selections for each prompt row.
   */
  public async applyMatching(
    question: ParsedQuestion,
    answer: MatchingAnswer
  ): Promise<InteractionResult> {
    const rows = question.matchingRows || [];
    const errors: string[] = [];
    const selectedMatches: string[] = [];

    try {
      for (const match of answer.matches) {
        const row = rows.find((r) => r.index === match.prompt_index);
        if (!row) {
          errors.push(`Prompt index ${match.prompt_index} not found in question`);
          continue;
        }

        // Target select element
        let selectLocator = row.selectId ? this.page.locator(`select#${escapeCssSelector(row.selectId)}`) : null;
        if (!selectLocator || await selectLocator.count() === 0) {
          selectLocator = this.page.locator(`select[name="${row.selectName}"]`);
        }

        if (await selectLocator.count() === 0) {
          // In-page evaluate fallback
          await this.page.evaluate(({ selectId, selectName, val }) => {
            let el = document.getElementById(selectId) as HTMLSelectElement | null;
            if (!el) el = document.querySelector(`select[name="${selectName}"]`) as HTMLSelectElement | null;
            if (el) {
              el.value = val;
              el.dispatchEvent(new Event('change', { bubbles: true }));
            }
          }, { selectId: row.selectId, selectName: row.selectName, val: match.option_value });
        } else {
          // Select the option by value
          await selectLocator.first().selectOption(match.option_value);
        }

        selectedMatches.push(`Row ${row.index} -> ${match.option_value}`);
      }

      // Verify selections in DOM
      const verification = await this.page.evaluate(
        (targetRows) => {
          return targetRows.map((r) => {
            let sel = document.getElementById(r.selectId) as HTMLSelectElement | null;
            if (!sel) sel = document.querySelector(`select[name="${r.selectName}"]`) as HTMLSelectElement | null;
            return { index: r.index, value: sel ? sel.value : null };
          });
        },
        rows
      );

      for (const match of answer.matches) {
        const actualValue = verification.find((v) => v.index === match.prompt_index)?.value;
        if (actualValue !== match.option_value) {
          errors.push(`Prompt #${match.prompt_index} expected value '${match.option_value}', but found '${actualValue}'`);
        }
      }

      if (errors.length > 0) {
        return {
          success: false,
          actionSummary: 'Matching dropdown verification failed',
          errors
        };
      }

      return {
        success: true,
        actionSummary: `Selected ${selectedMatches.length} matching dropdown values`,
        errors: []
      };
    } catch (err: any) {
      logger.error({ err: err.message }, 'Error applying matching dropdown selections');
      return {
        success: false,
        actionSummary: 'Error selecting dropdowns',
        errors: [err.message]
      };
    }
  }

  /**
   * Applies text or numerical input answer.
   */
  public async applyTextInput(
    question: ParsedQuestion,
    answer: TextAnswer
  ): Promise<InteractionResult> {
    const targetInput = question.textInputs?.[0];
    if (!targetInput) {
      return {
        success: false,
        actionSummary: 'No text input field available in DOM',
        errors: ['Question has no text inputs']
      };
    }

    try {
      let locator = targetInput.id ? this.page.locator(`input#${escapeCssSelector(targetInput.id)}`) : null;
      if (!locator || await locator.count() === 0) {
        locator = this.page.locator(`input[name="${targetInput.name}"]`);
      }
      if (await locator.count() === 0) {
        locator = this.page.locator('textarea, input[type="text"], input[type="number"]');
      }

      await locator.first().fill(answer.answer);

      return {
        success: true,
        actionSummary: `Filled text answer: '${answer.answer}'`,
        errors: []
      };
    } catch (err: any) {
      return {
        success: false,
        actionSummary: 'Failed to fill text input',
        errors: [err.message]
      };
    }
  }
}
