import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { StateManager } from '../../src/quiz/state';
import { QuestionExecutionResult } from '../../src/quiz/question-types';

describe('State Manager & Crash Recovery', () => {
  const testStatePath = 'state/test-quiz-state.json';

  beforeEach(() => {
    if (fs.existsSync(testStatePath)) {
      fs.unlinkSync(testStatePath);
    }
  });

  afterEach(() => {
    if (fs.existsSync(testStatePath)) {
      fs.unlinkSync(testStatePath);
    }
  });

  it('initializes fresh state and saves to disk', () => {
    const manager = new StateManager(testStatePath);
    const initialStats = manager.getSummaryStats();
    expect(initialStats.answered).toBe(0);

    const result: QuestionExecutionResult = {
      questionNumber: 1,
      questionHash: 'hash-123',
      type: 'single_choice',
      answer: { type: 'single_choice', answer: 'opt_A', confidence: 0.9, needs_search: false },
      confidence: 0.9,
      searched: false,
      status: 'answered',
      timestamp: new Date().toISOString(),
      latencyMs: 1200
    };

    manager.recordQuestionResult(result);
    expect(fs.existsSync(testStatePath)).toBe(true);

    const stats = manager.getSummaryStats();
    expect(stats.answered).toBe(1);
    expect(stats.lastQuestionNumber).toBe(1);
  });

  it('recovers state accurately after a simulated process crash', () => {
    // Process 1 runs and answers question 1 and 2, then crashes
    const manager1 = new StateManager(testStatePath);
    manager1.recordQuestionResult({
      questionNumber: 1,
      questionHash: 'hash-q1',
      type: 'single_choice',
      answer: { type: 'single_choice', answer: 'opt_1', confidence: 0.95, needs_search: false },
      confidence: 0.95,
      searched: false,
      status: 'answered',
      timestamp: new Date().toISOString(),
      latencyMs: 1000
    });
    manager1.recordQuestionResult({
      questionNumber: 2,
      questionHash: 'hash-q2',
      type: 'matching',
      answer: { type: 'matching', matches: [{ prompt_index: 0, option_value: 'val_1' }], confidence: 0.85, needs_search: true },
      confidence: 0.85,
      searched: true,
      status: 'answered',
      timestamp: new Date().toISOString(),
      latencyMs: 2500
    });

    // Process 2 starts up (simulating restart after crash)
    const manager2 = new StateManager(testStatePath);
    expect(manager2.isQuestionAlreadyAnswered('hash-q1')).toBe(true);
    expect(manager2.isQuestionAlreadyAnswered('hash-q2')).toBe(true);
    expect(manager2.isQuestionAlreadyAnswered('hash-q3_unknown')).toBe(false);

    const summary = manager2.getSummaryStats();
    expect(summary.answered).toBe(2);
    expect(summary.searches).toBe(1);
    expect(summary.lastQuestionNumber).toBe(2);
  });
});
