import { describe, it, expect } from 'vitest';
import { KnowledgeBase } from '../../src/quiz/knowledge-base';
import { ParsedQuestion } from '../../src/quiz/question-types';

describe('Ground Truth Knowledge Base', () => {
  const kb = new KnowledgeBase();

  it('matches matching question #1 from Attempt 1 review', () => {
    const mockQ1: ParsedQuestion = {
      number: 1,
      hash: 'hash-test-q1',
      type: 'matching',
      questionText: 'Pasangkan temuan insiden HMAC dengan responsnya.',
      instructionText: '',
      matchingRows: [
        {
          index: 0,
          promptText: 'B. Dump tanpa kunci',
          selectName: 'q1:sub0',
          selectId: 'menuq1_sub0',
          selectedValue: '0',
          options: [
            { value: '0', label: 'Choose...' },
            { value: '2', label: 'Rotasi dan bersihkan jalur logging' },
            { value: '8', label: 'Nilai leakage equality dan kandidat' },
            { value: '5', label: 'Anggap pengujian kandidat memungkinkan' }
          ]
        },
        {
          index: 1,
          promptText: 'A. Kunci ada di log',
          selectName: 'q1:sub1',
          selectId: 'menuq1_sub1',
          selectedValue: '0',
          options: [
            { value: '0', label: 'Choose...' },
            { value: '2', label: 'Rotasi dan bersihkan jalur logging' },
            { value: '8', label: 'Nilai leakage equality dan kandidat' }
          ]
        }
      ],
      images: []
    };

    const match = kb.matchQuestion(mockQ1);
    expect(match).not.toBeNull();
    expect(match?.type).toBe('matching');
    expect(match?.confidence).toBe(1.0);
    expect(match?.reason).toContain('Ground truth match from Attempt 1');
  });

  it('matches multiple choice question #2 from Attempt 1 review', () => {
    const mockQ2: ParsedQuestion = {
      number: 2,
      hash: 'hash-test-q2',
      type: 'multiple_choice',
      questionText: 'Pada portal akademik berbasis MariaDB hanya dump ciphertext yang bocor dan bukti menunjukkan KMS serta identitas decrypt tidak ikut bocor. Pilih dua tindakan yang tepat.',
      instructionText: 'Pilih dua tindakan yang tepat.',
      multipleChoiceOptions: [
        { id: 'opt_a', inputName: 'q2', value: 'a', label: 'Kirim DEK kepada auditor melalui email biasa', isChecked: false },
        { id: 'opt_b', inputName: 'q2', value: 'b', label: 'Pantau penyalahgunaan, nilai risiko kriptografis, dan pertahankan bukti untuk investigasi', isChecked: false },
        { id: 'opt_d', inputName: 'q2', value: 'd', label: 'Perlakukan kejadian sebagai insiden dan verifikasi cakupan serta integritas kontrol kunci', isChecked: false }
      ],
      images: []
    };

    const match = kb.matchQuestion(mockQ2);
    expect(match).not.toBeNull();
    expect(match?.type).toBe('multiple_choice');
    expect(match?.confidence).toBe(1.0);
  });
});
