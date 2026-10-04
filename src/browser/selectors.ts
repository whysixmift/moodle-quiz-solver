/**
 * Safe CSS identifier escape utility for Node and browser
 */
export function escapeCssSelector(id: string): string {
  if (!id) return '';
  return id.replace(/([ #;?%&,.+*~':"!^$[\]()=>|/@])/g, '\\$1');
}

/**
 * Moodle DOM Selectors & Semantic Matchers
 * Native CSS selectors only (safe for document.querySelector and Playwright locators)
 */
export const MOODLE_SELECTORS = {
  // Main question containers
  QUESTION_CONTAINER: [
    'div.que',
    'div.formulation',
    'div[id^="q"]',
    'section.question',
    '.que.multichoice',
    '.que.match',
    '.que.truefalse',
    '.que.shortanswer',
    '.que.numerical'
  ],

  // Question Info and Numbering
  QUESTION_NO: [
    '.info .no',
    '.info .qno',
    '.info h3.no',
    'h3.no',
    '.qno',
    '.info .accesshide'
  ],

  // Formulation / Question text
  QUESTION_TEXT: [
    '.qtext',
    '.formulation .qtext',
    '.formulation .content',
    '.formulation'
  ],

  // Additional instructions/prompt
  QUESTION_INSTRUCTIONS: [
    '.prompt',
    '.formulation .prompt',
    '.validationerror',
    '.answer-prompt'
  ],

  // Answer blocks
  ANSWER_CONTAINER: [
    '.answer',
    '.formulation .answer',
    'table.answer',
    'fieldset.answer'
  ],

  // Option rows for multiple choice / single choice
  CHOICE_ROWS: [
    '.answer > div',
    '.answer > .r0, .answer > .r1',
    '.answer label',
    '.answer .d-flex'
  ],

  // Matching rows / tables
  MATCHING_ROWS: [
    'table.answer tr',
    '.answer table tbody tr',
    '.que.match table.answer tr',
    '.que.match .answer tr',
    '.answer .match-row'
  ],

  // Inputs
  RADIO_INPUTS: 'input[type="radio"]',
  CHECKBOX_INPUTS: 'input[type="checkbox"]',
  SELECT_INPUTS: 'select',
  TEXT_INPUTS: 'input[type="text"], input[type="number"], textarea',

  // Timer selectors
  TIMER: [
    '#quiz-timer',
    '.mod_quiz-timer-wrapper',
    '#quiz-time-left',
    '#quiz-timer-wrapper',
    '.mod_quiz_timer',
    '[data-timer]',
    'div[id*="timer"]'
  ],

  // Navigation: Next Page / Continue
  NAV_NEXT: [
    'input[name="next"]',
    '#mod_quiz-next-nav',
    'input[value*="Next" i]',
    'input[value*="selanjutnya" i]',
    'input[type="submit"].mod_quiz-next-nav',
    'button.mod_quiz-next-nav',
    '.submitbtns input[type="submit"]',
    '.submitbtns button'
  ],

  // Navigation: Previous Page
  NAV_PREV: [
    'input[name="previous"]',
    '#mod_quiz-prev-nav',
    'input[value*="Previous" i]',
    'input[value*="sebelumnya" i]',
    'button.mod_quiz-prev-nav'
  ],

  // Navigation: Finish Attempt
  NAV_FINISH_ATTEMPT: [
    'input[value*="Finish attempt" i]',
    'input[value*="Selesaikan" i]',
    '.endtestlink',
    'a[href*="summary.php"]',
    '.btn-finishattempt input'
  ],

  // Navigation: Submit all and finish (Confirmation / summary page)
  NAV_SUBMIT_ALL: [
    'input[value*="Submit all and finish" i]',
    'input[value*="Kumpulkan semua" i]',
    '.btn-finishattempt input[type="submit"]',
    '.confirmation-buttons button.btn-primary',
    'button#submitallbtn'
  ],

  // Modal confirmation button (e.g. Moodle Boost modal dialog)
  MODAL_CONFIRM: [
    '.moodle-dialogue-confirm .btn-primary',
    '.modal-footer button.btn-primary',
    'div.modal.show button.btn-primary',
    'input[data-action="save"]'
  ],

  // Navigation Drawer / Question grid buttons
  QUESTION_NAV_BUTTONS: [
    '.qnbutton',
    '.mod_quiz-page-nav .qnbutton',
    '#mod_quiz_navblock a.qnbutton'
  ]
};
