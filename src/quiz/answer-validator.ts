import { ParsedQuestion, LLMQuizAnswer, SingleChoiceAnswer, MultipleChoiceAnswer, MatchingAnswer, TextAnswer } from './question-types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  normalizedAnswer?: LLMQuizAnswer;
}

export function validateAnswer(question: ParsedQuestion, answer: LLMQuizAnswer): ValidationResult {
  const errors: string[] = [];

  if (!answer) {
    return { isValid: false, errors: ['LLM returned an empty answer object'] };
  }

  switch (question.type) {
    case 'single_choice':
    case 'true_false': {
      if (answer.type !== 'single_choice') {
        errors.push(`Expected answer type 'single_choice' for question type '${question.type}', but received '${answer.type}'`);
        break;
      }
      const scAnswer = answer as SingleChoiceAnswer;
      const options = question.singleChoiceOptions || [];
      
      if (!scAnswer.answer || typeof scAnswer.answer !== 'string') {
        errors.push('Single choice answer must provide an option identifier string');
        break;
      }

      // Check if option ID or value matches available choices
      const matched = options.some(
        opt => opt.id === scAnswer.answer || opt.value === scAnswer.answer || opt.label.trim().toLowerCase() === scAnswer.answer.trim().toLowerCase()
      );

      if (!matched) {
        const validIds = options.map(o => `${o.id} (${o.value}: ${o.label.slice(0, 20)}...)`).join(', ');
        errors.push(`Chosen answer '${scAnswer.answer}' does not match any valid options: [${validIds}]`);
      }
      break;
    }

    case 'multiple_choice': {
      if (answer.type !== 'multiple_choice') {
        errors.push(`Expected answer type 'multiple_choice', but received '${answer.type}'`);
        break;
      }
      const mcAnswer = answer as MultipleChoiceAnswer;
      const options = question.multipleChoiceOptions || [];

      if (!Array.isArray(mcAnswer.answers) || mcAnswer.answers.length === 0) {
        errors.push('Multiple choice answer must contain at least one option identifier in answers array');
        break;
      }

      for (const ansId of mcAnswer.answers) {
        const matched = options.some(
          opt => opt.id === ansId || opt.value === ansId || opt.label.trim().toLowerCase() === ansId.trim().toLowerCase()
        );
        if (!matched) {
          errors.push(`Chosen answer '${ansId}' does not match any valid options`);
        }
      }
      break;
    }

    case 'matching': {
      if (answer.type !== 'matching') {
        errors.push(`Expected answer type 'matching', but received '${answer.type}'`);
        break;
      }
      const matchAnswer = answer as MatchingAnswer;
      const rows = question.matchingRows || [];

      if (!Array.isArray(matchAnswer.matches) || matchAnswer.matches.length === 0) {
        errors.push('Matching answer must contain a non-empty matches array');
        break;
      }

      if (matchAnswer.matches.length !== rows.length) {
        errors.push(`Expected ${rows.length} match items, but received ${matchAnswer.matches.length}`);
      }

      for (const match of matchAnswer.matches) {
        const row = rows.find(r => r.index === match.prompt_index);
        if (!row) {
          errors.push(`Invalid prompt_index ${match.prompt_index}`);
          continue;
        }

        // Validate that option_value exists in this row's dropdown options
        const validOption = row.options.some(
          opt => opt.value === match.option_value || opt.label.trim().toLowerCase() === match.option_value.trim().toLowerCase()
        );

        if (!validOption) {
          const available = row.options.map(o => `"${o.value}" (${o.label})`).join(', ');
          errors.push(`Option value '${match.option_value}' not found in dropdown for prompt #${row.index}. Available: [${available}]`);
        }
      }
      break;
    }

    case 'short_answer':
    case 'numerical': {
      if (answer.type !== 'text' && answer.type !== 'short_answer' && answer.type !== 'numerical') {
        errors.push(`Expected text/numerical answer type, received '${answer.type}'`);
        break;
      }
      const txtAnswer = answer as TextAnswer;
      if (typeof txtAnswer.answer !== 'string' || txtAnswer.answer.trim().length === 0) {
        errors.push('Text answer must be a non-empty string');
      }
      break;
    }

    default:
      // Unknown question type
      errors.push(`Cannot validate answer for unknown question type: ${question.type}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
    normalizedAnswer: answer
  };
}
