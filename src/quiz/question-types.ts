export type QuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'matching'
  | 'true_false'
  | 'short_answer'
  | 'numerical'
  | 'unknown';

export interface ChoiceOption {
  id: string; // The input element ID or name_value identifier
  inputName: string;
  value: string;
  label: string;
  isChecked: boolean;
}

export interface MatchingOption {
  value: string; // e.g., "1", "2", "3" or text
  label: string; // e.g., "Transistor", "Resistor", "Choose..."
}

export interface MatchingPromptRow {
  index: number;
  promptText: string;
  selectName: string;
  selectId: string;
  selectedValue: string;
  options: MatchingOption[];
}

export interface ImageAttachment {
  src: string;
  alt: string;
  width?: number;
  height?: number;
  base64Data?: string; // Captured if needed for multimodal vision
}

export interface RawExtractedQuestion {
  questionContainerFound: boolean;
  questionNumber: number | null;
  questionNumberRaw: string;
  questionText: string;
  instructionText: string;
  inferredType: QuestionType;
  options: ChoiceOption[];
  matchingRows: MatchingPromptRow[];
  textInputs: Array<{
    id: string;
    name: string;
    value: string;
    type: 'text' | 'textarea' | 'number';
  }>;
  images: ImageAttachment[];
  moodleClasses: string[];
  rawHtmlSummary: string;
}

export interface ParsedQuestion {
  number: number;
  hash: string;
  type: QuestionType;
  questionText: string;
  instructionText: string;
  singleChoiceOptions?: ChoiceOption[];
  multipleChoiceOptions?: ChoiceOption[];
  matchingRows?: MatchingPromptRow[];
  textInputs?: Array<{
    id: string;
    name: string;
    value: string;
    type: 'text' | 'textarea' | 'number';
  }>;
  images: ImageAttachment[];
}

export interface SingleChoiceAnswer {
  type: 'single_choice';
  answer: string; // ChoiceOption id or value
  confidence: number;
  needs_search: boolean;
  reason?: string;
}

export interface MultipleChoiceAnswer {
  type: 'multiple_choice';
  answers: string[]; // Array of ChoiceOption ids or values
  confidence: number;
  needs_search: boolean;
  reason?: string;
}

export interface MatchingAnswer {
  type: 'matching';
  matches: Array<{
    prompt_index: number;
    option_value: string;
  }>;
  confidence: number;
  needs_search: boolean;
  reason?: string;
}

export interface TextAnswer {
  type: 'text' | 'short_answer' | 'numerical';
  answer: string;
  confidence: number;
  needs_search: boolean;
  reason?: string;
}

export type LLMQuizAnswer =
  | SingleChoiceAnswer
  | MultipleChoiceAnswer
  | MatchingAnswer
  | TextAnswer;

export interface QuestionExecutionResult {
  questionNumber: number;
  questionHash: string;
  type: QuestionType;
  answer: LLMQuizAnswer;
  confidence: number;
  searched: boolean;
  searchQueries?: string[];
  status: 'answered' | 'skipped' | 'failed' | 'dry_run_evaluated';
  timestamp: string;
  latencyMs: number;
  errorMessage?: string;
}

export interface MoodleTimerState {
  found: boolean;
  rawText: string;
  totalSecondsRemaining: number;
  isWarning: boolean;
  isCritical: boolean;
}

export interface NavigationState {
  hasPreviousButton: boolean;
  hasNextButton: boolean;
  isFinalQuestionPage: boolean;
  isSummaryPage: boolean;
  isQuizFinished: boolean;
  nextButtonSelector?: string;
}
