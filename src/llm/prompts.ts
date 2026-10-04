import { ParsedQuestion } from '../quiz/question-types';
import { SearchResultItem } from '../search/search';

export const SYSTEM_PROMPT = `You are solving an authorized educational quiz.

Determine the objectively best answer from the supplied question and options.

Do not invent options.
Do not change option text.
For multiple choice, return every correct option and no incorrect option.
For matching questions, independently solve every row.
Pay attention to wording such as:
- except
- not
- least
- most
- best
- incorrect
- correct
- all
- only

Use technical knowledge and rigorous reasoning.
Return only valid JSON matching the exact schema requested without markdown fences or additional conversational prose.`;

export function buildQuestionPrompt(
  question: ParsedQuestion,
  searchResults?: SearchResultItem[]
): string {
  let prompt = `Question #${question.number}:\n${question.questionText}\n`;

  if (question.instructionText) {
    prompt += `Instructions: ${question.instructionText}\n`;
  }

  if (question.type === 'single_choice' || question.type === 'true_false') {
    prompt += `\nAvailable Options (Single Choice):\n`;
    question.singleChoiceOptions?.forEach((opt) => {
      prompt += `- ID: "${opt.id}" | Label: "${opt.label}"\n`;
    });
    prompt += `\nRequired JSON output format:
{
  "type": "single_choice",
  "answer": "EXACT_OPTION_ID",
  "confidence": 0.95,
  "needs_search": false,
  "reason": "concise rationale"
}`;
  } else if (question.type === 'multiple_choice') {
    const qLower = (question.questionText + ' ' + (question.instructionText || '')).toLowerCase();
    let countHint = '';
    if (qLower.includes('pilih dua') || qLower.includes('pilih 2')) {
      countHint = ' (NOTICE: The question explicitly asks to SELECT EXACTLY TWO OPTIONS)';
    } else if (qLower.includes('pilih tiga') || qLower.includes('pilih 3')) {
      countHint = ' (NOTICE: The question explicitly asks to SELECT EXACTLY THREE OPTIONS)';
    } else if (qLower.includes('pilih satu') || qLower.includes('pilih 1')) {
      countHint = ' (NOTICE: The question explicitly asks to SELECT EXACTLY ONE OPTION)';
    }
    prompt += `\nAvailable Options (Multiple Choice - select all that are correct)${countHint}:\n`;
    question.multipleChoiceOptions?.forEach((opt) => {
      prompt += `- ID: "${opt.id}" | Label: "${opt.label}"\n`;
    });
    prompt += `\nRequired JSON output format:
{
  "type": "multiple_choice",
  "answers": ["OPTION_ID_1", "OPTION_ID_2"],
  "confidence": 0.95,
  "needs_search": false,
  "reason": "concise rationale"
}`;
  } else if (question.type === 'matching') {
    prompt += `\nMatching Items (Each prompt row corresponds to a dropdown):\n`;
    question.matchingRows?.forEach((row) => {
      prompt += `\nPrompt [Index ${row.index}]: "${row.promptText}"\nDropdown Options for this row:\n`;
      row.options.forEach((opt) => {
        // filter out placeholder like "Choose..."
        prompt += `  * Value: "${opt.value}" | Label: "${opt.label}"\n`;
      });
    });
    prompt += `\nRequired JSON output format:
{
  "type": "matching",
  "matches": [
    {
      "prompt_index": 0,
      "option_value": "EXACT_OPTION_VALUE_FROM_DROPDOWN"
    },
    ...
  ],
  "confidence": 0.95,
  "needs_search": false,
  "reason": "concise rationale"
}`;
  } else {
    prompt += `\nThis is a direct text/numerical question. Provide the exact answer value.\n`;
    prompt += `Required JSON output format:
{
  "type": "text",
  "answer": "YOUR_EXACT_ANSWER",
  "confidence": 0.95,
  "needs_search": false,
  "reason": "concise rationale"
}`;
  }

  if (searchResults && searchResults.length > 0) {
    prompt += `\n\n--- External Web Search Snippets ---\n`;
    searchResults.forEach((res, idx) => {
      prompt += `[Source ${idx + 1}: ${res.title}]\n${res.snippet}\n\n`;
    });
    prompt += `Use the above search results if helpful to verify your answer.\n`;
  }

  return prompt;
}

export function buildRepairPrompt(
  originalPrompt: string,
  failedResponseText: string,
  validationErrors: string[]
): string {
  return `${originalPrompt}

PREVIOUS RESPONSE WAS INVALID:
Errors:
${validationErrors.map(e => `- ${e}`).join('\n')}

Previous raw response was:
${failedResponseText}

Please correct your output and return ONLY the valid JSON object strictly complying with the schema and available option values.`;
}
