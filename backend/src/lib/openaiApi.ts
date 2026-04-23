import { config } from '../config';

const OPENAI_BASE = 'https://api.openai.com/v1';

export type OpenAIModel = 'gpt-4o-mini' | 'gpt-4o';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatCompletionParams {
  model: OpenAIModel;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  timeoutMs?: number;
}

export interface ChatCompletionResponse {
  content: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export class OpenAIError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
    this.name = 'OpenAIError';
  }
}

export function isOpenAIConfigured(): boolean {
  return config.openaiApiKey.length > 0;
}

export async function chatCompletion(params: ChatCompletionParams): Promise<ChatCompletionResponse> {
  if (!isOpenAIConfigured()) {
    throw new OpenAIError('OPENAI_API_KEY not configured');
  }

  const body = {
    model: params.model,
    messages: params.messages,
    temperature: params.temperature ?? 0.2,
    max_tokens: params.maxTokens ?? 300,
    ...(params.jsonMode && { response_format: { type: 'json_object' } }),
  };

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), params.timeoutMs ?? 10_000);

  try {
    const resp = await fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.openaiApiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (!resp.ok) {
      throw new OpenAIError(`OpenAI ${resp.status}: ${await resp.text()}`, resp.status);
    }

    const data = await resp.json() as {
      choices: Array<{ message: { content: string } }>;
      usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
    };

    const content = data.choices?.[0]?.message?.content ?? '';
    return {
      content,
      promptTokens: data.usage?.prompt_tokens ?? 0,
      completionTokens: data.usage?.completion_tokens ?? 0,
      totalTokens: data.usage?.total_tokens ?? 0,
    };
  } catch (err) {
    if (err instanceof OpenAIError) throw err;
    if (err instanceof Error && err.name === 'AbortError') {
      throw new OpenAIError('OpenAI request timed out');
    }
    throw new OpenAIError(err instanceof Error ? err.message : 'Unknown OpenAI error');
  } finally {
    clearTimeout(timeout);
  }
}
