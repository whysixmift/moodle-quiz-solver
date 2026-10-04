import { describe, it, expect } from 'vitest';
import {
  SingleChoiceAnswerSchema,
  MultipleChoiceAnswerSchema,
  MatchingAnswerSchema,
  TextAnswerSchema,
  GeneralQuizAnswerSchema
} from '../../src/llm/schemas';

describe('LLM Response Schemas', () => {
  it('validates single choice response', () => {
    const valid = {
      type: 'single_choice',
      answer: 'choice_1',
      confidence: 0.95,
      needs_search: false,
      reason: 'Standard networking definition'
    };
    const parsed = SingleChoiceAnswerSchema.parse(valid);
    expect(parsed.answer).toBe('choice_1');
    expect(parsed.confidence).toBe(0.95);
  });

  it('rejects empty answer in single choice', () => {
    const invalid = {
      type: 'single_choice',
      answer: '',
      confidence: 0.9
    };
    expect(() => SingleChoiceAnswerSchema.parse(invalid)).toThrow();
  });

  it('validates multiple choice response', () => {
    const valid = {
      type: 'multiple_choice',
      answers: ['choice_A', 'choice_C'],
      confidence: 0.88,
      needs_search: false
    };
    const parsed = MultipleChoiceAnswerSchema.parse(valid);
    expect(parsed.answers).toEqual(['choice_A', 'choice_C']);
  });

  it('validates matching response', () => {
    const valid = {
      type: 'matching',
      matches: [
        { prompt_index: 0, option_value: 'val_1' },
        { prompt_index: 1, option_value: 'val_3' }
      ],
      confidence: 0.92,
      needs_search: false
    };
    const parsed = MatchingAnswerSchema.parse(valid);
    expect(parsed.matches).toHaveLength(2);
    expect(parsed.matches[0].option_value).toBe('val_1');
  });

  it('validates text answer response', () => {
    const valid = {
      type: 'text',
      answer: '42',
      confidence: 1.0,
      needs_search: false
    };
    const parsed = TextAnswerSchema.parse(valid);
    expect(parsed.answer).toBe('42');
  });

  it('validates discriminated union correctly', () => {
    const parsed = GeneralQuizAnswerSchema.parse({
      type: 'matching',
      matches: [{ prompt_index: 0, option_value: 'optA' }],
      confidence: 0.8
    });
    expect(parsed.type).toBe('matching');
  });
});
