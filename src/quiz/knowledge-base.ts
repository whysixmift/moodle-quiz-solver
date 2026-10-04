import fs from 'fs';
import path from 'path';
import { ParsedQuestion, LLMQuizAnswer, MatchingAnswer, SingleChoiceAnswer, MultipleChoiceAnswer } from './question-types';
import { normalizeText } from './question-parser';
import { logger } from '../utils/logger';

export interface GroundTruthEntry {
  number: number;
  source_attempt?: number;
  original_number?: number;
  type: string;
  question_text: string;
  ground_truth: string;
  structured_matching?: Array<{ prompt: string; answer: string }>;
}

export class KnowledgeBase {
  private entries: GroundTruthEntry[] = [];
  private isLoaded = false;

  constructor(filePath?: string) {
    const targetPath = path.resolve(process.cwd(), filePath || 'data/knowledge_base.json');
    if (fs.existsSync(targetPath)) {
      try {
        const raw = fs.readFileSync(targetPath, 'utf-8');
        this.entries = JSON.parse(raw);
        this.isLoaded = true;
        logger.info({ count: this.entries.length }, 'Loaded verified Ground Truth Knowledge Base');
      } catch (err: any) {
        logger.warn({ err: err.message }, 'Failed to parse Knowledge Base JSON');
      }
    } else {
      logger.info('Knowledge Base file not found at: ' + targetPath);
    }
  }

  /**
   * Token similarity ratio (combines Jaccard similarity and subset containment)
   */
  private similarity(textA: string, textB: string): number {
    const wordsA = new Set(normalizeText(textA).toLowerCase().match(/\w+/g) || []);
    const wordsB = new Set(normalizeText(textB).toLowerCase().match(/\w+/g) || []);

    if (wordsA.size === 0 || wordsB.size === 0) return 0;

    let intersection = 0;
    for (const w of wordsA) {
      if (wordsB.has(w)) intersection++;
    }

    const union = new Set([...wordsA, ...wordsB]).size;
    const jaccard = union > 0 ? intersection / union : 0;
    const containment = Math.max(intersection / wordsA.size, intersection / wordsB.size);
    return Math.max(jaccard, containment * 0.82);
  }

  /**
   * Strips prefix labels like [CODE-A], A., 1. to compare clean prompt content
   */
  private cleanPrompt(text: string): string {
    return text
      .replace(/^\[CODE-[A-Z0-9_-]+\]\s*/i, '')
      .replace(/^[A-Za-z0-9]\.\s+/, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Searches the Knowledge Base for a matching question and maps the ground-truth answer
   * to the current DOM option IDs or dropdown values.
   */
  public matchQuestion(question: ParsedQuestion): LLMQuizAnswer | null {
    if (!this.isLoaded || this.entries.length === 0) return null;

    // 1. Find entry by highest text similarity
    let bestEntry: GroundTruthEntry | null = null;
    let highestSim = 0;

    for (const entry of this.entries) {
      const sim = this.similarity(question.questionText, entry.question_text);
      if (sim > highestSim) {
        highestSim = sim;
        bestEntry = entry;
      }
    }

    // Require high confidence match (> 0.60 word overlap or containment)
    if (!bestEntry || highestSim < 0.60) {
      return null;
    }

    logger.info(
      { questionNo: question.number, kbMatchNo: bestEntry.number, attempt: bestEntry.source_attempt || '1/2', similarity: highestSim.toFixed(2) },
      '🎯 Ground Truth Knowledge Base match found'
    );

    const gt = bestEntry.ground_truth;

    // 2. Map answer according to question type
    if (question.type === 'matching') {
      let pairs: Array<{ prompt: string; answer: string }> = bestEntry.structured_matching || [];

      // Fallback: parse pairs if not structured
      if (pairs.length === 0 && gt.includes('→')) {
        const rawPairs = gt.split(/,\s*(?=[A-Za-z0-9\[])/).map(p => p.split('→').map(s => s.trim()));
        pairs = rawPairs
          .filter(p => p.length >= 2)
          .map(p => ({ prompt: p[0], answer: p[1] }));
      }

      const matches: Array<{ prompt_index: number; option_value: string }> = [];

      for (const row of question.matchingRows || []) {
        let matchedVal = '';
        let bestPromptSim = 0;
        let matchedPair: { prompt: string; answer: string } | null = null;

        // Find best matching prompt pair
        for (const pair of pairs) {
          const rawSim = this.similarity(row.promptText, pair.prompt);
          const cleanSim = this.similarity(this.cleanPrompt(row.promptText), this.cleanPrompt(pair.prompt));
          const effectiveSim = Math.max(rawSim, cleanSim);

          if (effectiveSim > bestPromptSim && effectiveSim > 0.35) {
            bestPromptSim = effectiveSim;
            matchedPair = pair;
          }
        }

        if (matchedPair) {
          // Match targetAnswer against row's dropdown options
          let bestOptVal = '';
          let bestOptSim = 0;
          for (const opt of row.options) {
            const optSim = this.similarity(opt.label, matchedPair.answer);
            if (optSim > bestOptSim) {
              bestOptSim = optSim;
              bestOptVal = opt.value;
            }
          }
          if (bestOptSim > 0.30) {
            matchedVal = bestOptVal;
          }
        }

        if (matchedVal) {
          matches.push({ prompt_index: row.index, option_value: matchedVal });
        }
      }

      if (matches.length === (question.matchingRows || []).length) {
        const answer: MatchingAnswer = {
          type: 'matching',
          matches,
          confidence: 1.0,
          needs_search: false,
          reason: `Ground truth match from Attempt ${bestEntry.source_attempt || 1} (Question #${bestEntry.original_number || bestEntry.number})`
        };
        return answer;
      }
    } else if (question.type === 'single_choice' || question.type === 'true_false') {
      const options = question.singleChoiceOptions || [];
      let bestOptId = '';
      let bestOptSim = 0;

      for (const opt of options) {
        // Direct string match or similarity
        if (opt.label.trim().toLowerCase() === gt.trim().toLowerCase()) {
          bestOptId = opt.id;
          bestOptSim = 1.0;
          break;
        }

        const sim = this.similarity(opt.label, gt);
        if (sim > bestOptSim) {
          bestOptSim = sim;
          bestOptId = opt.id;
        }
      }

      if (bestOptId && bestOptSim > 0.45) {
        const answer: SingleChoiceAnswer = {
          type: 'single_choice',
          answer: bestOptId,
          confidence: 1.0,
          needs_search: false,
          reason: `Ground truth match from Attempt ${bestEntry.source_attempt || 1} (Question #${bestEntry.original_number || bestEntry.number})`
        };
        return answer;
      }
    } else if (question.type === 'multiple_choice') {
      const options = question.multipleChoiceOptions || [];
      const answers: string[] = [];

      // Calculate inclusion ratio of each option's words inside gt
      const gtWords = new Set(normalizeText(gt).toLowerCase().match(/\w+/g) || []);
      const scoredOptions: Array<{ id: string; ratio: number; label: string }> = [];

      for (const opt of options) {
        const optWords = normalizeText(opt.label).toLowerCase().match(/\w+/g) || [];
        if (optWords.length === 0) continue;
        let matched = 0;
        for (const w of optWords) {
          if (gtWords.has(w)) matched++;
        }
        const ratio = matched / optWords.length;
        scoredOptions.push({ id: opt.id, ratio, label: opt.label });
      }

      // Check how many answers are required from question prompt
      let expectedCount = 2;
      const qLower = (question.questionText + ' ' + (question.instructionText || '')).toLowerCase();
      if (qLower.includes('pilih tiga') || qLower.includes('pilih 3')) {
        expectedCount = 3;
      } else if (qLower.includes('pilih satu') || qLower.includes('pilih 1')) {
        expectedCount = 1;
      } else if (qLower.includes('pilih empat') || qLower.includes('pilih 4')) {
        expectedCount = 4;
      }

      scoredOptions.sort((a, b) => b.ratio - a.ratio);

      // Select options with high inclusion ratio (> 0.70)
      for (const item of scoredOptions) {
        if (item.ratio > 0.70) {
          answers.push(item.id);
        }
      }

      // If strict threshold missed some, fill up to expected count with top candidate(s) if ratio > 0.45
      if (answers.length < expectedCount && scoredOptions.length >= expectedCount) {
        for (let i = 0; i < expectedCount; i++) {
          const item = scoredOptions[i];
          if (item && item.ratio > 0.45 && !answers.includes(item.id)) {
            answers.push(item.id);
          }
        }
      }

      if (answers.length > 0) {
        const answer: MultipleChoiceAnswer = {
          type: 'multiple_choice',
          answers,
          confidence: 1.0,
          needs_search: false,
          reason: `Ground truth match from Attempt ${bestEntry.source_attempt || 1} (Question #${bestEntry.original_number || bestEntry.number})`
        };
        return answer;
      }
    }

    return null;
  }
}
