import { describe, it, expect } from 'vitest';
import { parseRawQuestion, computeQuestionHash, normalizeText } from '../../src/quiz/question-parser';
import { RawExtractedQuestion } from '../../src/quiz/question-types';

describe('Question Parser & Hashing', () => {
  it('normalizes text and ignores extra whitespace', () => {
    const raw = '  What   is   the  OSI model? \n\n';
    expect(normalizeText(raw)).toBe('What is the OSI model?');
  });

  it('computes stable hash for identical question and choices regardless of case/whitespace', () => {
    const hash1 = computeQuestionHash('What is IPv6?', 'single_choice', ['128 bits', '32 bits', '64 bits']);
    const hash2 = computeQuestionHash('what is ipv6? ', 'single_choice', ['32 bits', ' 128 bits ', '64 bits']);
    expect(hash1).toBe(hash2);
  });

  it('produces different hash for different options', () => {
    const hash1 = computeQuestionHash('What is IPv6?', 'single_choice', ['128 bits', '32 bits']);
    const hash2 = computeQuestionHash('What is IPv6?', 'single_choice', ['128 bits', '48 bits']);
    expect(hash1).not.toBe(hash2);
  });

  it('parses raw extracted single choice question', () => {
    const raw: RawExtractedQuestion = {
      questionContainerFound: true,
      questionNumber: 5,
      questionNumberRaw: 'Question 5',
      questionText: 'Which layer is TCP located in?',
      instructionText: 'Select one:',
      inferredType: 'single_choice',
      options: [
        { id: 'q5_a', inputName: 'resp_5', value: '1', label: 'Layer 4 - Transport', isChecked: false },
        { id: 'q5_b', inputName: 'resp_5', value: '2', label: 'Layer 3 - Network', isChecked: false }
      ],
      matchingRows: [],
      textInputs: [],
      images: [],
      moodleClasses: ['que', 'multichoice'],
      rawHtmlSummary: ''
    };

    const parsed = parseRawQuestion(raw);
    expect(parsed.number).toBe(5);
    expect(parsed.type).toBe('single_choice');
    expect(parsed.singleChoiceOptions).toHaveLength(2);
    expect(parsed.hash).toBeDefined();
  });

  it('parses raw matching question with dropdowns', () => {
    const raw: RawExtractedQuestion = {
      questionContainerFound: true,
      questionNumber: 12,
      questionNumberRaw: 'Soal 12',
      questionText: 'Cocokkan protokol dengan port standarnya:',
      instructionText: '',
      inferredType: 'matching',
      options: [],
      matchingRows: [
        {
          index: 0,
          promptText: 'HTTP',
          selectName: 'sub_0',
          selectId: 'menu_sub_0',
          selectedValue: '0',
          options: [
            { value: '80', label: 'Port 80' },
            { value: '443', label: 'Port 443' }
          ]
        },
        {
          index: 1,
          promptText: 'HTTPS',
          selectName: 'sub_1',
          selectId: 'menu_sub_1',
          selectedValue: '0',
          options: [
            { value: '80', label: 'Port 80' },
            { value: '443', label: 'Port 443' }
          ]
        }
      ],
      textInputs: [],
      images: [],
      moodleClasses: ['que', 'match'],
      rawHtmlSummary: ''
    };

    const parsed = parseRawQuestion(raw);
    expect(parsed.number).toBe(12);
    expect(parsed.type).toBe('matching');
    expect(parsed.matchingRows).toHaveLength(2);
    expect(parsed.hash).toBeDefined();
  });
});
