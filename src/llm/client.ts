import http from 'http';
import https from 'https';
import { logger } from '../utils/logger';

export interface LLMMessageContentImage {
  type: 'image_url';
  image_url: {
    url: string;
  };
}

export interface LLMMessageContentText {
  type: 'text';
  text: string;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<LLMMessageContentText | LLMMessageContentImage>;
}

export interface LLMClientOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  modelsPool?: string[];
  timeoutMs?: number;
  maxRetries?: number;
}

export class OpenAICompatibleClient {
  private baseUrl: string;
  private apiKey: string;
  private modelsPool: string[];
  private currentModelIndex: number = 0;
  private timeoutMs: number;
  private maxRetries: number;
  private httpAgent: http.Agent;
  private httpsAgent: https.Agent;

  constructor(options: LLMClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.apiKey = options.apiKey;
    
    // If a pool of models is given (e.g. comma separated in env), parse and use it
    if (options.modelsPool && options.modelsPool.length > 0) {
      this.modelsPool = options.modelsPool;
    } else if (options.model.includes(',')) {
      this.modelsPool = options.model.split(',').map(m => m.trim()).filter(Boolean);
    } else {
      this.modelsPool = [options.model];
    }

    this.timeoutMs = options.timeoutMs || 25000;
    this.maxRetries = options.maxRetries || 4;

    // HTTP Keep-Alive agents for low latency
    this.httpAgent = new http.Agent({ keepAlive: true, maxSockets: 10 });
    this.httpsAgent = new https.Agent({ keepAlive: true, maxSockets: 10 });
  }

  public getActiveModel(): string {
    return this.modelsPool[this.currentModelIndex % this.modelsPool.length];
  }

  public rotateModel(): string {
    this.currentModelIndex = (this.currentModelIndex + 1) % this.modelsPool.length;
    const nextModel = this.getActiveModel();
    logger.info({ nextModel, pool: this.modelsPool }, '🔄 Round-robin switched to next combo model');
    return nextModel;
  }

  public async chatCompletion(messages: LLMMessage[]): Promise<string> {
    const endpoint = `${this.baseUrl}/chat/completions`;
    let lastError: Error | null = null;

    // Total attempts across models
    const totalAttempts = Math.max(this.maxRetries, this.modelsPool.length * 2);

    for (let attempt = 1; attempt <= totalAttempts; attempt++) {
      const activeModel = this.getActiveModel();
      const startTime = Date.now();

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(this.apiKey ? { 'Authorization': `Bearer ${this.apiKey}` } : {})
          },
          body: JSON.stringify({
            model: activeModel,
            messages,
            temperature: 0.1
          }),
          signal: controller.signal
        });

        clearTimeout(timeout);
        const latency = Date.now() - startTime;

        if (response.status === 429 || response.status === 403 || response.status === 503) {
          const errorBody = await response.text();
          logger.warn(
            { status: response.status, activeModel, errorBody: errorBody.slice(0, 120) },
            `Rate limit or provider error on model ${activeModel}. Triggering Round-Robin failover...`
          );
          this.rotateModel();
          await new Promise(res => setTimeout(res, 500));
          continue;
        }

        if (!response.ok) {
          const errorBody = await response.text();
          logger.warn({ status: response.status, activeModel, errorBody: errorBody.slice(0, 120) }, 'Request failed, rotating model');
          this.rotateModel();
          continue;
        }

        const rawText = await response.text();
        let content: string | undefined;

        // Clean trailing SSE markers like 'data: [DONE]' if present
        let cleanText = rawText.trim();
        if (cleanText.includes('data: [DONE]')) {
          cleanText = cleanText.split('data: [DONE]')[0].trim();
        }

        // Check if response is streaming SSE format (lines of 'data: {...}')
        if (cleanText.startsWith('data: ')) {
          const lines = cleanText.split('\n');
          let accumulated = '';
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('data: ') && !trimmed.includes('[DONE]')) {
              try {
                const chunk = JSON.parse(trimmed.slice(6));
                const delta = chunk.choices?.[0]?.delta?.content || chunk.choices?.[0]?.message?.content || '';
                accumulated += delta;
              } catch {
                // ignore unparseable chunk
              }
            }
          }
          content = accumulated;
        } else {
          try {
            const data: any = JSON.parse(cleanText);
            // Some proxies return an error payload inside 200 OK
            if (data.error) {
              throw new Error(`Proxy error payload: ${JSON.stringify(data.error)}`);
            }
            content = data.choices?.[0]?.message?.content;
          } catch (jsonErr: any) {
            throw new Error(`Failed to parse LLM JSON response: ${jsonErr.message}. Raw: ${cleanText.slice(0, 150)}`);
          }
        }

        if (!content) {
          throw new Error(`LLM response on ${activeModel} contained no content in choices[0].message`);
        }

        logger.debug({ latency, model: activeModel }, 'LLM chat completion successful');
        return content;
      } catch (err: any) {
        lastError = err;
        logger.warn({ attempt, failedModel: activeModel, error: err.message }, 'Attempt failed. Rotating to next combo model in pool...');
        this.rotateModel();
        const backoff = Math.min(1000, 300 * attempt);
        await new Promise(res => setTimeout(res, backoff));
      }
    }

    throw new Error(`All LLM models in round-robin pool failed after ${totalAttempts} attempts. Last error: ${lastError?.message}`);
  }
}
