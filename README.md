# Moodle AI Quiz Solver (eLearningRakyat / OnnoCenter Edition)

A production-quality, deterministic AI-assisted Moodle quiz solver designed for authorized educational quizzes. Built with **Node.js**, **TypeScript**, **Playwright (with Brave / Chromium)**, strict **Zod** schema validation, and OpenAI-compatible LLM endpoints with intelligent web search fallback.

---

## Key Features

- **DOM-First Extraction**: Directly extracts question text, choice options, matching `<select>` tables, and instruction fields from the live Moodle DOM.
- **Deterministic Playwright Interactions**: Uses semantic element IDs, form control names, and label relations instead of visual mouse coordinates.
- **Full Question Type Support**:
  1. **Single Choice**: Selects corresponding radio button (`input[type=radio]`).
  2. **Multiple Choice**: Checks/unchecks boxes (`input[type=checkbox]`).
  3. **Matching Questions**: Independently solves each prompt row and selects the exact matching value in `<select>` dropdowns.
  4. **True / False**: Resolves boolean questions.
  5. **Short Answer / Numerical**: Fills text and number input fields.
  6. **Image Questions**: Extracts diagrams and image context for vision models when necessary.
- **Dual Localization Support**: Native support for English and Indonesian Moodle interfaces (*"Halaman selanjutnya"*, *"Selesaikan kuis"*, *"Kumpulkan semua dan selesai"*).
- **Multi-Model Round-Robin Failover**: Automatically cycles through a pool of models (e.g. `fast-coding,frontend-primary,research-primary,coding-primary`) if any provider hits a rate limit (429) or upstream error (503).
- **Fast Pacing & Low Latency**: HTTP keep-alive, low LLM temperature, and compact prompt structures targeting **5–8 questions/minute**.
- **Conditional Web Search Fallback**: Only queries web search when the LLM confidence is below `CONFIDENCE_THRESHOLD` (e.g. `< 0.75`).
- **Timer Awareness**: Actively monitors Moodle's countdown timer. Automatically switches to expedited mode and throttles search when entering warning (< 10 mins) or critical (< 3 mins) thresholds.
- **Crash Recovery & State Persistence**: Maintains a local state store (`state/quiz-state.json`) with question SHA-256 hashes to prevent duplicate work and allow seamless resumption.
- **Dry-Run Mode**: Allows testing questions and inspecting LLM outputs without making DOM changes or navigating pages.
- **Manual Login & Security**: Zero credential storage. Authentication is done manually by the user in Brave/Chrome. `AUTO_SUBMIT` defaults to `false` for manual safety review.

---

## Architecture

```
src/
├── browser/
│   ├── connection.ts       # CDP attach to running Brave session or fallback launch
│   ├── moodle.ts           # Timer, navigation state, finish/submit detection, diagnostics
│   ├── selectors.ts        # Robust Moodle CSS selectors & safe escaping helpers
│   ├── extraction.ts       # In-page DOM extraction script for questions and controls
│   └── interactions.ts     # Deterministic radio/checkbox/select/text interactions
├── llm/
│   ├── client.ts           # OpenAI-compatible client with keep-alive, retries, 429 backoff
│   ├── prompts.ts          # Quiz system prompt, question formatter, and repair prompts
│   ├── schemas.ts          # Zod schemas for strict JSON response validation
│   └── solver.ts           # Solver coordinator with validation, repair, & search fallback
├── search/
│   └── search.ts           # Lightweight search query builder and snippet extractor
├── quiz/
│   ├── question-types.ts   # Core TypeScript interfaces for questions & answers
│   ├── question-parser.ts  # Normalization, DOM parsing, and SHA-256 question hashing
│   ├── answer-validator.ts # Answer validator verifying options exist in DOM
│   ├── state.ts            # Local JSON state persistence and metrics tracker
│   └── executor.ts         # Main quiz execution loop, metrics, and pacing controller
└── cli/
    └── index.ts            # Commander CLI (inspect, solve, status, resume)
```

---

## Requirements

- **Node.js**: v18+ (tested on Node v26)
- **Brave Browser** or **Google Chrome / Chromium** installed on your system.

---

## Installation & Setup

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   Copy the example config:
   ```bash
   cp config/.env.example .env
   ```

   Edit `.env` with your preferred LLM provider details:
   ```env
   # Browser remote debugging port
   BROWSER_CDP_URL=http://127.0.0.1:9222
   BROWSER_EXECUTABLE_PATH=/usr/sbin/brave

   # OpenAI-compatible API
   LLM_BASE_URL=https://api.openai.com/v1
   LLM_API_KEY=your-api-key-here
   LLM_MODEL=gpt-4o-mini

   # Confidence threshold for triggering search fallback (0.0 to 1.0)
   CONFIDENCE_THRESHOLD=0.75
   ENABLE_SEARCH=true

   # Safety settings
   AUTO_SUBMIT=false
   WARNING_TIME_SECONDS=600
   CRITICAL_TIME_SECONDS=180
   ```

---

## Step-by-Step Workflow

### Step 1: Start Brave with Remote Debugging

Launch Brave with remote debugging enabled on port `9222`:

```bash
# Linux
brave --remote-debugging-port=9222 --user-data-dir=/tmp/brave-quiz-profile

# Or on macOS
/Applications/Brave\ Browser.app/Contents/MacOS/Brave\ Browser --remote-debugging-port=9222 --user-data-dir=/tmp/brave-quiz-profile
```

### Step 2: Log in & Open Quiz

1. In the Brave window that just opened, navigate to:
   ```
   https://lms.onnocenter.or.id/moodle/login/index.php
   ```
2. Log in manually with your account.
3. Open your quiz attempt:
   ```
   https://lms.onnocenter.or.id/moodle/mod/quiz/attempt.php
   ```

### Step 3: Run DOM Inspection (Verification)

Before running the solver, verify that the application detects the question and DOM controls:

```bash
npm run inspect
```

This prints a diagnostic summary showing:
- Question number and type
- Question text
- Detected dropdowns or choice controls
- Countdown timer value
- Navigation buttons

### Step 4: Run Dry-Run Mode (Test without modifying page)

```bash
npm run solve -- --dry-run
```

In dry-run mode:
- Reads the current question
- Queries the LLM
- Shows the proposed answer and confidence
- **Does not click any inputs or navigate**

### Step 5: Start the Solver (Live Mode)

```bash
npm run solve
```

The CLI will log the live progress:
```text
[16:10:01] Question 23 detected
[16:10:01] Type: multiple_choice
[16:10:01] Options / Rows: 4
[16:10:02] LLM answer: q23_cb0, q23_cb1
[16:10:02] Confidence: 0.94
[16:10:02] Search: no
[16:10:02] Selecting answers...
📊 Progress: 23 answered | Speed: 7.2 q/min | Avg Latency: 1.85s | Searches: 2 | Timer: Time left 00:45:10
[16:10:02] Next page
[16:10:03] Question 24 detected
```

### Step 6: Check Progress & Stats

At any time, you can view the state summary:

```bash
npm run status
```

### Step 7: Resuming After Crash or Pause

If your connection drops or the process is stopped, resume directly from the last saved state:

```bash
npm run resume
```

---

## CLI Options & Flags

| Flag | Description | Default |
|------|-------------|---------|
| `--dry-run` | Evaluate answers without clicking or navigating | `false` |
| `--auto-submit` | Automatically confirm final quiz submission | `false` |
| `--no-search` | Disable search fallback entirely | `false` |
| `--model <name>` | Override the LLM model name | From `.env` |
| `--confidence <val>`| Override confidence threshold (e.g., `0.85`) | `0.75` |
| `--max-questions <n>` | Limit number of questions processed in run | Unlimited |
| `--cdp-url <url>` | Override browser CDP endpoint | `http://127.0.0.1:9222` |
| `--debug` | Enable detailed debug logs | `false` |

---

## Final Submission Behavior

`AUTO_SUBMIT` defaults to **`false`**.

When the final question is answered and the quiz reaches the *"Finish attempt..."* / *"Summary of attempt"* page:
- The solver halts safely.
- It displays a clear message asking the user to review the answers before submitting.
- To enable automatic submission, set `AUTO_SUBMIT=true` in `.env` or pass `--auto-submit`.

---

## Running Tests

Run the complete test suite (27 unit and integration tests):

```bash
npm test
```

Includes tests for:
- Zod LLM schema validation
- Question parsing, text normalization, and SHA-256 deduplication hashing
- Answer validation against available DOM options
- Crash recovery and JSON state persistence
- Web search query builder and snippet formulation
- Playwright DOM extraction and deterministic interactions on Single Choice, Multiple Choice, Matching `<select>` dropdowns, True/False, and Moodle Timers
- End-to-end QuizExecutor simulation with automatic malformed JSON repair
