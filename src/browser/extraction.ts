import { Page } from 'playwright';
import { RawExtractedQuestion, ChoiceOption, MatchingPromptRow, ImageAttachment, QuestionType } from '../quiz/question-types';

/**
 * Executes an in-page DOM extraction script returning clean semantic data.
 */
export async function extractQuestionFromDOM(page: Page): Promise<RawExtractedQuestion> {
  const result = await page.evaluate(() => {
    // 1. Locate Question Container
    const questionContainer =
      document.querySelector('div.que') ||
      document.querySelector('.formulation')?.closest('div') ||
      document.querySelector('section.question') ||
      document.querySelector('form#responseform .que');

    if (!questionContainer) {
      return {
        questionContainerFound: false,
        questionNumber: null,
        questionNumberRaw: '',
        questionText: '',
        instructionText: '',
        inferredType: 'unknown' as QuestionType,
        options: [],
        matchingRows: [],
        textInputs: [],
        images: [],
        moodleClasses: [],
        rawHtmlSummary: document.body.innerText.slice(0, 300)
      };
    }

    const classNames = Array.from(questionContainer.classList);

    // 2. Extract Question Number
    const qNoEl =
      questionContainer.querySelector('.info .no') ||
      questionContainer.querySelector('.info .qno') ||
      questionContainer.querySelector('h3.no') ||
      questionContainer.querySelector('.info .accesshide') ||
      document.querySelector('.qnbutton.thispage');

    let questionNumberRaw = qNoEl ? (qNoEl.textContent || '').trim() : '';
    let questionNumber: number | null = null;
    const numMatch = questionNumberRaw.match(/\d+/);
    if (numMatch) {
      questionNumber = parseInt(numMatch[0], 10);
    }

    // 3. Extract Question Text & Instructions
    const qTextEl =
      questionContainer.querySelector('.qtext') ||
      questionContainer.querySelector('.formulation .content') ||
      questionContainer.querySelector('.formulation');

    let questionText = '';
    if (qTextEl) {
      // Clone element to remove option containers before getting text
      const clone = qTextEl.cloneNode(true) as HTMLElement;
      const removeSub = clone.querySelectorAll('.answer, .prompt, .validationerror');
      removeSub.forEach(el => el.remove());
      questionText = (clone.textContent || '').replace(/\s+/g, ' ').trim();
    }

    const promptEl = questionContainer.querySelector('.prompt');
    const instructionText = promptEl ? (promptEl.textContent || '').replace(/\s+/g, ' ').trim() : '';

    // 4. Extract Images inside question formulation
    const images: ImageAttachment[] = [];
    const imgEls = (qTextEl || questionContainer).querySelectorAll('img');
    imgEls.forEach((img) => {
      const src = img.getAttribute('src') || '';
      const alt = img.getAttribute('alt') || '';
      // Ignore tiny moodle icons/decorations
      if (src && !src.includes('/theme/') && !src.includes('/pix/')) {
        images.push({
          src,
          alt,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height
        });
      }
    });

    // 5. Detect Controls & Question Type
    const selectEls = Array.from(questionContainer.querySelectorAll('select'));
    const checkboxEls = Array.from(questionContainer.querySelectorAll('input[type="checkbox"]'));
    const radioEls = Array.from(questionContainer.querySelectorAll('input[type="radio"]'));
    const textEls = Array.from(
      questionContainer.querySelectorAll('input[type="text"], input[type="number"], textarea')
    );

    let inferredType: QuestionType = 'unknown';
    const options: ChoiceOption[] = [];
    const matchingRows: MatchingPromptRow[] = [];

    // --- CASE A: MATCHING QUESTIONS ---
    // Moodle matching questions feature table.answer with tr rows containing prompt text and a <select>
    if (selectEls.length > 0 && (classNames.includes('match') || questionContainer.querySelector('table.answer, .que.match'))) {
      inferredType = 'matching';

      const trEls = Array.from(questionContainer.querySelectorAll('table.answer tr, .answer table tr, .que.match tr'));

      let rowIndex = 0;
      trEls.forEach((tr) => {
        const select = tr.querySelector('select');
        if (!select) return;

        // Prompt text is typically in the first td / td.text
        const textTd = tr.querySelector('td.text') || tr.querySelector('td:not(:has(select))') || tr.firstElementChild;
        let promptText = textTd ? (textTd.textContent || '').replace(/\s+/g, ' ').trim() : '';
        if (!promptText) {
          promptText = `Item ${rowIndex + 1}`;
        }

        const selectOptions: Array<{ value: string; label: string }> = [];
        Array.from(select.options).forEach((opt) => {
          const val = opt.value;
          const lbl = (opt.textContent || '').replace(/\s+/g, ' ').trim();
          // Keep all options or note if placeholder
          if (val !== '' && val !== '0' && !lbl.toLowerCase().includes('choose') && !lbl.toLowerCase().includes('pilih')) {
            selectOptions.push({ value: val, label: lbl });
          } else if (selectOptions.length === 0 && val !== '') {
            // Keep fallback
            selectOptions.push({ value: val, label: lbl });
          }
        });

        matchingRows.push({
          index: rowIndex,
          promptText,
          selectName: select.getAttribute('name') || '',
          selectId: select.getAttribute('id') || '',
          selectedValue: select.value,
          options: selectOptions
        });

        rowIndex++;
      });
    }
    // --- CASE B: MULTIPLE CHOICE (Checkboxes) ---
    else if (checkboxEls.length > 0) {
      inferredType = 'multiple_choice';

      checkboxEls.forEach((cb) => {
        const input = cb as HTMLInputElement;
        const id = input.id;
        const name = input.name;
        const val = input.value;
        const isChecked = input.checked;

        // Find label
        let labelText = '';
        if (id) {
          const lbl = questionContainer.querySelector(`label[for="${id}"]`);
          if (lbl) labelText = (lbl.textContent || '').replace(/\s+/g, ' ').trim();
        }
        if (!labelText) {
          const parentLabel = input.closest('label');
          if (parentLabel) labelText = (parentLabel.textContent || '').replace(/\s+/g, ' ').trim();
        }
        if (!labelText) {
          const row = input.closest('.r0, .r1, .d-flex, div');
          if (row) labelText = (row.textContent || '').replace(/\s+/g, ' ').trim();
        }

        options.push({
          id: id || `${name}_${val}`,
          inputName: name,
          value: val,
          label: labelText || val,
          isChecked
        });
      });
    }
    // --- CASE C: SINGLE CHOICE / TRUE-FALSE (Radios) ---
    else if (radioEls.length > 0) {
      inferredType = classNames.includes('truefalse') ? 'true_false' : 'single_choice';

      radioEls.forEach((rb) => {
        const input = rb as HTMLInputElement;
        const id = input.id;
        const name = input.name;
        const val = input.value;
        const isChecked = input.checked;

        // Find label
        let labelText = '';
        if (id) {
          const lbl = questionContainer.querySelector(`label[for="${id}"]`);
          if (lbl) labelText = (lbl.textContent || '').replace(/\s+/g, ' ').trim();
        }
        if (!labelText) {
          const parentLabel = input.closest('label');
          if (parentLabel) labelText = (parentLabel.textContent || '').replace(/\s+/g, ' ').trim();
        }
        if (!labelText) {
          const row = input.closest('.r0, .r1, .d-flex, div');
          if (row) labelText = (row.textContent || '').replace(/\s+/g, ' ').trim();
        }

        options.push({
          id: id || `${name}_${val}`,
          inputName: name,
          value: val,
          label: labelText || val,
          isChecked
        });
      });
    }
    // --- CASE D: SHORT ANSWER / TEXT / NUMERICAL ---
    else if (textEls.length > 0) {
      inferredType = classNames.includes('numerical') ? 'numerical' : 'short_answer';
    }

    const textInputs = textEls.map((el) => {
      const input = el as HTMLInputElement | HTMLTextAreaElement;
      return {
        id: input.id || '',
        name: input.name || '',
        value: input.value || '',
        type: (input.tagName.toLowerCase() === 'textarea' ? 'textarea' : 'text') as 'text' | 'textarea' | 'number'
      };
    });

    return {
      questionContainerFound: true,
      questionNumber,
      questionNumberRaw,
      questionText,
      instructionText,
      inferredType,
      options,
      matchingRows,
      textInputs,
      images,
      moodleClasses: classNames,
      rawHtmlSummary: (qTextEl?.textContent || questionContainer.textContent || '').slice(0, 300)
    };
  });

  return result;
}
