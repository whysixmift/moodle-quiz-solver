import { describe, it, expect } from 'vitest';
import { validateAnswer } from '../../src/quiz/answer-validator';
import { ParsedQuestion, SingleChoiceAnswer, MultipleChoiceAnswer, MatchingAnswer } from '../../src/quiz/question-types';

describe('Answer Validator', () => {
  const mockSingleChoiceQuestion: ParsedQuestion = {
    number: 1,
    hash: 'hash-sc-1',
    type: 'single_choice',
    questionText: 'Choose the correct option',
    instructionText: '',
    singleChoiceOptions: [
      { id: 'opt_1', inputName: 'q1', value: 'v1', label: 'Option A', isChecked: false },
      { id: 'opt_2', inputName: 'q1', value: 'v2', label: 'Option B', isChecked: false }
    ],
    images: []
  };

  const mockMatchingQuestion: ParsedQuestion = {
    number: 2,
    hash: 'hash-match-2',
    type: 'matching',
    questionText: 'Match items',
    instructionText: '',
    matchingRows: [
      {
        index: 0,
        promptText: 'Item 1',
        selectName: 's1',
        selectId: 'sel_1',
        selectedValue: '',
        options: [
          { value: 'match_val_A', label: 'Val A' },
          { value: 'match_val_B', label: 'Val B' }
        ]
      },
      {
        index: 1,
        promptText: 'Item 2',
        selectName: 's2',
        selectId: 'sel_2',
        selectedValue: '',
        options: [
          { value: 'match_val_A', label: 'Val A' },
          { value: 'match_val_B', label: 'Val B' }
        ]
      }
    ],
    images: []
  };

  it('accepts valid single choice answer by id', () => {
    const ans: SingleChoiceAnswer = {
      type: 'single_choice',
      answer: 'opt_1',
      confidence: 0.9,
      needs_search: false
    };
    const res = validateAnswer(mockSingleChoiceQuestion, ans);
    expect(res.isValid).toBe(true);
    expect(res.errors).toHaveLength(0);
  });

  it('accepts valid single choice answer by value', () => {
    const ans: SingleChoiceAnswer = {
      type: 'single_choice',
      answer: 'v2',
      confidence: 0.9,
      needs_search: false
    };
    const res = validateAnswer(mockSingleChoiceQuestion, ans);
    expect(res.isValid).toBe(true);
  });

  it('rejects hallucinated single choice option', () => {
    const ans: SingleChoiceAnswer = {
      type: 'single_choice',
      answer: 'opt_999_nonexistent',
      confidence: 0.9,
      needs_search: false
    };
    const res = validateAnswer(mockSingleChoiceQuestion, ans);
    expect(res.isValid).toBe(false);
    expect(res.errors[0]).toContain('does not match any valid options');
  });

  it('validates matching answer mappings', () => {
    const ans: MatchingAnswer = {
      type: 'matching',
      matches: [
        { prompt_index: 0, option_value: 'match_val_B' },
        { prompt_index: 1, option_value: 'match_val_A' }
      ],
      confidence: 0.95,
      needs_search: false
    };
    const res = validateAnswer(mockMatchingQuestion, ans);
    expect(res.isValid).toBe(true);
  });

  it('rejects matching answer with invalid dropdown option value', () => {
    const ans: MatchingAnswer = {
      type: 'matching',
      matches: [
        { prompt_index: 0, option_value: 'invalid_value_XYZ' },
        { prompt_index: 1, option_value: 'match_val_A' }
      ],
      confidence: 0.95,
      needs_search: false
    };
    const res = validateAnswer(mockMatchingQuestion, ans);
    expect(res.isValid).toBe(false);
    expect(res.errors[0]).toContain('not found in dropdown');
  });
});
