import fs from 'fs';
import path from 'path';
import { QuestionExecutionResult } from './question-types';
import { logger } from '../utils/logger';

export interface QuizSessionState {
  startedAt: string;
  updatedAt: string;
  totalAnswered: number;
  totalSkipped: number;
  totalFailed: number;
  totalSearches: number;
  latenciesMs: number[];
  questions: Record<string, QuestionExecutionResult>; // keyed by question hash
  questionsByNumber: Record<number, string>; // questionNumber -> hash
  lastQuestionNumber: number;
  quizUrl?: string;
  estimatedRemainingSeconds?: number;
}

export class StateManager {
  private filePath: string;
  private state: QuizSessionState;

  constructor(customPath?: string) {
    this.filePath = path.resolve(process.cwd(), customPath || 'state/quiz-state.json');
    this.state = this.loadState();
  }

  private loadState(): QuizSessionState {
    try {
      if (fs.existsSync(this.filePath)) {
        const data = fs.readFileSync(this.filePath, 'utf-8');
        return JSON.parse(data);
      }
    } catch (err) {
      logger.warn({ err }, 'Failed to read existing state file, initializing fresh state');
    }

    return {
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalAnswered: 0,
      totalSkipped: 0,
      totalFailed: 0,
      totalSearches: 0,
      latenciesMs: [],
      questions: {},
      questionsByNumber: {},
      lastQuestionNumber: 0
    };
  }

  public save(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      this.state.updatedAt = new Date().toISOString();
      fs.writeFileSync(this.filePath, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      logger.error({ err }, 'Failed to save state to file');
    }
  }

  public recordQuestionResult(result: QuestionExecutionResult): void {
    this.state.questions[result.questionHash] = result;
    this.state.questionsByNumber[result.questionNumber] = result.questionHash;
    this.state.lastQuestionNumber = Math.max(this.state.lastQuestionNumber, result.questionNumber);

    if (result.status === 'answered' || result.status === 'dry_run_evaluated') {
      this.state.totalAnswered++;
    } else if (result.status === 'skipped') {
      this.state.totalSkipped++;
    } else if (result.status === 'failed') {
      this.state.totalFailed++;
    }

    if (result.searched) {
      this.state.totalSearches++;
    }

    if (result.latencyMs > 0) {
      this.state.latenciesMs.push(result.latencyMs);
    }

    this.save();
  }

  public getQuestionByHash(hash: string): QuestionExecutionResult | undefined {
    return this.state.questions[hash];
  }

  public getQuestionByNumber(num: number): QuestionExecutionResult | undefined {
    const hash = this.state.questionsByNumber[num];
    if (hash) {
      return this.state.questions[hash];
    }
    return undefined;
  }

  public isQuestionAlreadyAnswered(hash: string): boolean {
    const q = this.state.questions[hash];
    return q !== undefined && (q.status === 'answered' || q.status === 'dry_run_evaluated');
  }

  public getState(): QuizSessionState {
    return this.state;
  }

  public getSummaryStats() {
    const answered = Object.values(this.state.questions).filter(q => q.status === 'answered' || q.status === 'dry_run_evaluated').length;
    const skipped = Object.values(this.state.questions).filter(q => q.status === 'skipped').length;
    const failed = Object.values(this.state.questions).filter(q => q.status === 'failed').length;
    const searches = Object.values(this.state.questions).filter(q => q.searched).length;
    
    const latencies = this.state.latenciesMs;
    const avgLatencyMs = latencies.length > 0 ? latencies.reduce((a, b) => a + b, 0) / latencies.length : 0;
    
    const startTime = new Date(this.state.startedAt).getTime();
    const elapsedTimeSec = (Date.now() - startTime) / 1000;
    const questionsPerMin = elapsedTimeSec > 0 ? (answered / (elapsedTimeSec / 60)) : 0;

    return {
      answered,
      skipped,
      failed,
      searches,
      avgLatencyMs: Math.round(avgLatencyMs),
      avgLatencySec: (avgLatencyMs / 1000).toFixed(2),
      questionsPerMin: questionsPerMin.toFixed(1),
      lastQuestionNumber: this.state.lastQuestionNumber
    };
  }

  public reset(): void {
    this.state = {
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      totalAnswered: 0,
      totalSkipped: 0,
      totalFailed: 0,
      totalSearches: 0,
      latenciesMs: [],
      questions: {},
      questionsByNumber: {},
      lastQuestionNumber: 0
    };
    this.save();
  }
}
