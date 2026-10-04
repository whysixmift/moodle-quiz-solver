import crypto from 'crypto';
import { RawExtractedQuestion, ParsedQuestion, QuestionType } from './question-types';

/**
 * Normalizes text by trimming whitespace, collapsing extra spaces and lowercasing.
 */
export function normalizeText(text: string): string {
  return (text || '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Generates a stable SHA-256 hash representing the question text and available choices.
 */
export function computeQuestionHash(
  questionText: string,
  type: QuestionType,
  optionsOrPrompts: string[]
): string {
  const normQ = normalizeText(questionText).toLowerCase();
  const normOpts = optionsOrPrompts.map(o => normalizeText(o).toLowerCase()).sort().join('|');
  const payload = `${type}::${normQ}::${normOpts}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

/**
 * Parses and validates raw extracted question from the browser into a structured ParsedQuestion.
 */
export function parseRawQuestion(raw: RawExtractedQuestion): ParsedQuestion {
  const questionNumber = raw.questionNumber ?? 1;
  const questionText = normalizeText(raw.questionText);
  const instructionText = normalizeText(raw.instructionText);
  const type = raw.inferredType;

  // Build string array for hashing based on question type
  const hashElements: string[] = [];

  if (type === 'matching') {
    raw.matchingRows.forEach((row) => {
      hashElements.push(`prompt:${normalizeText(row.promptText)}`);
      row.options.forEach((opt) => {
        hashElements.push(`opt:${normalizeText(opt.label)}`);
      });
    });
  } else if (type === 'single_choice' || type === 'multiple_choice' || type === 'true_false') {
    raw.options.forEach((opt) => {
      hashElements.push(`choice:${normalizeText(opt.label)}`);
    });
  } else {
    hashElements.push(`textInputs:${raw.textInputs.length}`);
  }

  const hash = computeQuestionHash(questionText, type, hashElements);

  const parsed: ParsedQuestion = {
    number: questionNumber,
    hash,
    type,
    questionText,
    instructionText,
    images: raw.images || []
  };

  if (type === 'single_choice' || type === 'true_false') {
    parsed.singleChoiceOptions = raw.options;
  } else if (type === 'multiple_choice') {
    parsed.multipleChoiceOptions = raw.options;
  } else if (type === 'matching') {
    parsed.matchingRows = raw.matchingRows;
  } else if (type === 'short_answer' || type === 'numerical') {
    parsed.textInputs = raw.textInputs;
  }

  return parsed;
}
