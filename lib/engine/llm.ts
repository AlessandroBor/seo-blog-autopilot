import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import type { z } from "zod";

/**
 * One OpenAI-compatible client for every LLM call. Point LLM_BASE_URL at xAI,
 * OpenAI, OpenRouter, etc. Structured outputs (json_schema) are required, which
 * all three support.
 */
let client: OpenAI | null = null;

function llm(): OpenAI {
  if (client) return client;
  if (!process.env.LLM_API_KEY) throw new Error("Missing LLM_API_KEY.");
  client = new OpenAI({
    apiKey: process.env.LLM_API_KEY,
    baseURL: process.env.LLM_BASE_URL || "https://api.x.ai/v1",
  });
  return client;
}

export const models = {
  get fast() {
    return process.env.LLM_MODEL_FAST || "grok-4-fast-non-reasoning";
  },
  get reasoning() {
    return process.env.LLM_MODEL_REASONING || "grok-4-fast-reasoning";
  },
  get vision() {
    return process.env.LLM_MODEL_VISION || process.env.LLM_MODEL_FAST || "grok-4-fast-non-reasoning";
  },
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function withRetry<T>(fn: () => Promise<T>, retries = 3, delayMs = 4000): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 1) throw err;
    console.warn(`[llm] request failed, retrying in ${delayMs / 1000}s (${retries - 1} left)`);
    await sleep(delayMs);
    return withRetry(fn, retries - 1, delayMs);
  }
}

type Message = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/** Chat call that must return an object matching `schema`. Retries, then throws. */
export async function structured<S extends z.ZodTypeAny>(opts: {
  schema: S;
  name: string;
  messages: Message[];
  model?: string;
  temperature?: number;
}): Promise<z.infer<S>> {
  const res = await withRetry(() =>
    llm().beta.chat.completions.parse({
      model: opts.model ?? models.fast,
      messages: opts.messages,
      temperature: opts.temperature,
      response_format: zodResponseFormat(opts.schema, opts.name),
    }),
  );
  const parsed = res.choices[0]?.message.parsed;
  if (!parsed) throw new Error(`LLM returned no parsable "${opts.name}" object.`);
  return parsed as z.infer<S>;
}

/** Plain-text chat call. */
export async function text(opts: {
  messages: Message[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}): Promise<string> {
  const res = await withRetry(() =>
    llm().chat.completions.create({
      model: opts.model ?? models.fast,
      messages: opts.messages,
      temperature: opts.temperature,
      max_tokens: opts.maxTokens,
    }),
  );
  return res.choices[0]?.message.content?.trim() ?? "";
}

/** Rejects if `promise` takes longer than `ms`. */
export function withTimeout<T>(promise: Promise<T>, ms: number, label = "Operation"): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}
