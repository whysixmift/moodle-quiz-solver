import pino from 'pino';
import path from 'path';
import fs from 'fs';

const logsDir = path.resolve(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const logFilePath = path.join(logsDir, `moodle-solver-${new Date().toISOString().slice(0, 10)}.log`);

const fileStream = fs.createWriteStream(logFilePath, { flags: 'a' });

export const logger = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    redact: ['apiKey', 'LLM_API_KEY', 'password', 'token', 'authorization', 'headers.authorization'],
    timestamp: pino.stdTimeFunctions.isoTime,
  },
  pino.multistream([
    {
      level: (process.env.LOG_LEVEL || 'info') as pino.Level,
      stream: process.stdout
    },
    {
      level: 'debug' as pino.Level,
      stream: fileStream
    }
  ])
);

// Simple pretty console logging helpers for clean terminal progress
export function formatTime(seconds: number): string {
  if (isNaN(seconds) || seconds < 0) return '00:00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  return `${hrs.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function logCli(msg: string): void {
  const timestamp = new Date().toLocaleTimeString('en-US', { hour12: false });
  console.log(`[${timestamp}] ${msg}`);
}
