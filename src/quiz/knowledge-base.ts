import fs from 'fs';
import path from 'path';
import { ParsedQuestion, LLMQuizAnswer, MatchingAnswer, SingleChoiceAnswer, MultipleChoiceAnswer } from './question-types';
import { normalizeText } from './question-parser';
import { logger } from '../utils/logger';

export interface GroundTruthEntry {
  number: number;
  status_attempt_1: string;
  mark_attempt_1: string;
  type: string;
  question_text: string;
  ground_truth: string;
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
   * Token similarity ratio (Jaccard similarity on lowercased alphanumeric words)
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
    return union > 0 ? intersection / union : 0;
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

    // Require high confidence match (> 0.70 word overlap)
    if (!bestEntry || highestSim < 0.70) {
      return null;
    }

    logger.info(
      { questionNo: question.number, kbMatchNo: bestEntry.number, similarity: highestSim.toFixed(2) },
      '🎯 Ground Truth Knowledge Base match found'
    );

    const gt = bestEntry.ground_truth;

    // 2. Map answer according to question type
    if (question.type === 'matching') {
      // Ground truth format: "Prompt1 → Answer1, Prompt2 → Answer2"
      const pairs = gt.split(/,\s*(?=[A-Za-z0-9\[])/).map(p => p.split('→').map(s => s.trim()));
      const matches: Array<{ prompt_index: number; option_value: string }> = [];

      for (const row of question.matchingRows || []) {
        // Find corresponding pair
        let matchedVal = '';
        for (const [promptText, targetAnswer] of pairs) {
          if (promptText && targetAnswer) {
            const pSim = this.similarity(row.promptText, promptText);
            if (pSim > 0.4) {
              // Match targetAnswer against row's dropdown options
              let bestOptVal = '';
              let bestOptSim = 0;
              for (const opt of row.options) {
                const optSim = this.similarity(opt.label, targetAnswer);
                if (optSim > bestOptSim) {
                  bestOptSim = optSim;
                  bestOptVal = opt.value;
                }
              }
              if (bestOptSim > 0.4) {
                matchedVal = bestOptVal;
                break;
              }
            }
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
          reason: `Ground truth match from Attempt 1 (Question #${bestEntry.number})`
        };
        return answer;
      }
    } else if (question.type === 'single_choice' || question.type === 'true_false') {
      const options = question.singleChoiceOptions || [];
      let bestOptId = '';
      let bestOptSim = 0;

      for (const opt of options) {
        const sim = this.similarity(opt.label, gt);
        if (sim > bestOptSim) {
          bestOptSim = sim;
          bestOptId = opt.id;
        }
      }

      if (bestOptId && bestOptSim > 0.5) {
        const answer: SingleChoiceAnswer = {
          type: 'single_choice',
          answer: bestOptId,
          confidence: 1.0,
          needs_search: false,
          reason: `Ground truth match from Attempt 1 (Question #${bestEntry.number})`
        };
        return answer;
      }
    } else if (question.type === 'multiple_choice') {
      const options = question.multipleChoiceOptions || [];
      // Ground truth may contain comma separated labels
      const answers: string[] = [];

      for (const opt of options) {
        // If option label is contained in ground truth
        if (gt.toLowerCase().includes(opt.label.toLowerCase()) || this.similarity(opt.label, gt) > 0.6) {
          answers.push(opt.id);
        }
      }

      if (answers.length > 0) {
        const answer: MultipleChoiceAnswer = {
          type: 'multiple_choice',
          answers,
          confidence: 1.0,
          needs_search: false,
          reason: `Ground truth match from Attempt 1 (Question #${bestEntry.number})`
        };
        return answer;
      }
    }

    return null;
  }
}
