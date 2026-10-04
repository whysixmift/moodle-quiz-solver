import { OpenAICompatibleClient, LLMMessage } from './client';
import { SYSTEM_PROMPT, buildQuestionPrompt, buildRepairPrompt } from './prompts';
import { GeneralQuizAnswerSchema } from './schemas';
import { ParsedQuestion, LLMQuizAnswer } from '../quiz/question-types';
import { validateAnswer } from '../quiz/answer-validator';
import { SearchProvider, SearchResultItem } from '../search/search';
import { logger } from '../utils/logger';

export interface SolverOptions {
  confidenceThreshold: number;
  enableSearch: boolean;
  maxSearchResults?: number;
}

export interface SolveResult {
  answer: LLMQuizAnswer;
  confidence: number;
  searched: boolean;
  searchQueries?: string[];
  latencyMs: number;
  reason?: string;
}

export class QuestionSolver {
  private client: OpenAICompatibleClient;
  private searchProvider: SearchProvider;
  private options: SolverOptions;

  constructor(client: OpenAICompatibleClient, options: SolverOptions) {
    this.client = client;
    this.options = options;
    this.searchProvider = new SearchProvider(options.maxSearchResults || 3);
  }

  public async solve(
    question: ParsedQuestion,
    isLowTime = false
  ): Promise<SolveResult> {
    const startTime = Date.now();
    let searched = false;
    const searchQueries: string[] = [];
    let searchResults: SearchResultItem[] | undefined;

    // 1. First Pass: Ask LLM
    const initialUserPrompt = buildQuestionPrompt(question);
    const messages: LLMMessage[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: initialUserPrompt }
    ];

    // If question has base64 image data, include it
    if (question.images && question.images.length > 0) {
      const imgContents = question.images
        .filter(img => img.base64Data)
        .map(img => ({
          type: 'image_url' as const,
          image_url: { url: `data:image/png;base64,${img.base64Data}` }
        }));

      if (imgContents.length > 0) {
        messages[1] = {
          role: 'user',
          content: [
            { type: 'text', text: initialUserPrompt },
            ...imgContents
          ]
        };
      }
    }

    let rawAnswer = await this.client.chatCompletion(messages);
    let parsedAnswer = this.parseAndValidate(question, rawAnswer, initialUserPrompt);

    // If repair was needed
    if (!parsedAnswer.isValid) {
      logger.warn({ questionNo: question.number, errors: parsedAnswer.errors }, 'Initial LLM response failed validation, attempting repair');
      const repairPrompt = buildRepairPrompt(initialUserPrompt, rawAnswer, parsedAnswer.errors);
      const repairMessages: LLMMessage[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: repairPrompt }
      ];
      rawAnswer = await this.client.chatCompletion(repairMessages);
      parsedAnswer = this.parseAndValidate(question, rawAnswer, repairPrompt);

      if (!parsedAnswer.isValid) {
        throw new Error(`Failed to obtain a valid answer from LLM: ${parsedAnswer.errors.join('; ')}`);
      }
    }

    let finalAnswer = parsedAnswer.answer!;
    const confidence = finalAnswer.confidence ?? 1.0;

    // 2. Search Fallback: If confidence < threshold or model explicitly requests search, and search is enabled & time allows
    const needsSearch =
      (confidence < this.options.confidenceThreshold || finalAnswer.needs_search) &&
      this.options.enableSearch &&
      !isLowTime;

    if (needsSearch) {
      logger.info(
        { questionNo: question.number, confidence, threshold: this.options.confidenceThreshold },
        'Confidence below threshold, triggering web search fallback'
      );

      const query = this.searchProvider.formulateQuery(
        question.questionText,
        question.singleChoiceOptions?.map(o => o.label).join('\n')
      );
      searchQueries.push(query);

      const searchResp = await this.searchProvider.search(query);
      if (searchResp.success && searchResp.results.length > 0) {
        searched = true;
        searchResults = searchResp.results;

        // Re-evaluate with search results
        const enrichedPrompt = buildQuestionPrompt(question, searchResults);
        const enrichedMessages: LLMMessage[] = [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: enrichedPrompt }
        ];

        const enrichedRaw = await this.client.chatCompletion(enrichedMessages);
        const enrichedParsed = this.parseAndValidate(question, enrichedRaw, enrichedPrompt);

        if (enrichedParsed.isValid && enrichedParsed.answer) {
          finalAnswer = enrichedParsed.answer;
        }
      }
    }

    const latencyMs = Date.now() - startTime;

    return {
      answer: finalAnswer,
      confidence: finalAnswer.confidence ?? confidence,
      searched,
      searchQueries: searchQueries.length > 0 ? searchQueries : undefined,
      latencyMs,
      reason: finalAnswer.reason
    };
  }

  private parseAndValidate(
    question: ParsedQuestion,
    rawText: string,
    originalPrompt: string
  ): { isValid: boolean; answer?: LLMQuizAnswer; errors: string[] } {
    try {
      // Clean possible markdown code fences (```json ... ```)
      const cleanJson = rawText
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();

      const parsedObj = JSON.parse(cleanJson);
      const schemaValidation = GeneralQuizAnswerSchema.safeParse(parsedObj);

      if (!schemaValidation.success) {
        return {
          isValid: false,
          errors: schemaValidation.error.issues.map((e: any) => `${e.path.join('.')}: ${e.message}`)
        };
      }

      const answer = schemaValidation.data as LLMQuizAnswer;
      const domValidation = validateAnswer(question, answer);

      if (!domValidation.isValid) {
        return {
          isValid: false,
          errors: domValidation.errors
        };
      }

      return {
        isValid: true,
        answer,
        errors: []
      };
    } catch (err: any) {
      return {
        isValid: false,
        errors: [`JSON parse error: ${err.message}`]
      };
    }
  }
}
