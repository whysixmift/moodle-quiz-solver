import { z } from 'zod';

export const SingleChoiceAnswerSchema = z.object({
  type: z.literal('single_choice'),
  answer: z.string().min(1, 'Option identifier is required'),
  confidence: z.number().min(0).max(1),
  needs_search: z.boolean().default(false),
  reason: z.string().optional()
});

export const MultipleChoiceAnswerSchema = z.object({
  type: z.literal('multiple_choice'),
  answers: z.array(z.string().min(1)).min(1, 'At least one option identifier is required'),
  confidence: z.number().min(0).max(1),
  needs_search: z.boolean().default(false),
  reason: z.string().optional()
});

export const MatchItemSchema = z.object({
  prompt_index: z.number().int().min(0),
  option_value: z.string().min(1, 'Dropdown option value is required')
});

export const MatchingAnswerSchema = z.object({
  type: z.literal('matching'),
  matches: z.array(MatchItemSchema).min(1, 'At least one match pair is required'),
  confidence: z.number().min(0).max(1),
  needs_search: z.boolean().default(false),
  reason: z.string().optional()
});

export const TextAnswerSchema = z.object({
  type: z.enum(['text', 'short_answer', 'numerical']),
  answer: z.string().min(1, 'Text answer is required'),
  confidence: z.number().min(0).max(1),
  needs_search: z.boolean().default(false),
  reason: z.string().optional()
});

export const GeneralQuizAnswerSchema = z.discriminatedUnion('type', [
  SingleChoiceAnswerSchema,
  MultipleChoiceAnswerSchema,
  MatchingAnswerSchema,
  TextAnswerSchema
]);

export type SingleChoiceOutput = z.infer<typeof SingleChoiceAnswerSchema>;
export type MultipleChoiceOutput = z.infer<typeof MultipleChoiceAnswerSchema>;
export type MatchingOutput = z.infer<typeof MatchingAnswerSchema>;
export type TextOutput = z.infer<typeof TextAnswerSchema>;
export type GeneralQuizOutput = z.infer<typeof GeneralQuizAnswerSchema>;
