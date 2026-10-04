import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { z } from 'zod';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from root or config directory if present
const possibleEnvPaths = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'config', '.env'),
  path.resolve(__dirname, '..', '..', '.env'),
  path.resolve(__dirname, '..', '..', 'config', '.env')
];

for (const envPath of possibleEnvPaths) {
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
    break;
  }
}

const ConfigSchema = z.object({
  BROWSER_CDP_URL: z.string().default('http://127.0.0.1:9222'),
  BROWSER_EXECUTABLE_PATH: z.string().default('/usr/sbin/brave'),
  LLM_BASE_URL: z.string().default('https://api.openai.com/v1'),
  LLM_API_KEY: z.string().default(''),
  LLM_MODEL: z.string().default('fast-coding,frontend-primary,research-primary,coding-primary'),
  CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.75),
  ENABLE_SEARCH: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(true),
  MAX_SEARCH_RESULTS: z.coerce.number().default(3),
  AUTO_SUBMIT: z.preprocess((val) => val === 'true' || val === true, z.boolean()).default(false),
  WARNING_TIME_SECONDS: z.coerce.number().default(600),
  CRITICAL_TIME_SECONDS: z.coerce.number().default(180),
  LOG_LEVEL: z.string().default('info'),
  TARGET_QUIZ_URL: z.string().default('https://lms.example.com/moodle/mod/quiz/attempt.php'),
  STATE_FILE_PATH: z.string().default('state/quiz-state.json'),
  LOGS_DIR: z.string().default('logs')
});

export type AppConfig = z.infer<typeof ConfigSchema>;

let _config: AppConfig | null = null;

export function getConfig(overrides?: Partial<AppConfig>): AppConfig {
  const cleanOverrides: Record<string, any> = {};
  if (overrides) {
    for (const [k, v] of Object.entries(overrides)) {
      if (v !== undefined) {
        cleanOverrides[k] = v;
      }
    }
  }

  const parsed = ConfigSchema.parse({
    ...process.env,
    ...cleanOverrides
  });
  _config = parsed;
  return _config;
}
