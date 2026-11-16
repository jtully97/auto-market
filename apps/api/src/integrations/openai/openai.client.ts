import OpenAI from 'openai';
import { z } from 'zod';
import { env } from '../../config/env.js';
import { BadRequestError, ExternalServiceError } from '../../core/errors.js';

let client: OpenAI | null = null;
const getClient = () => {
  if (!env.OPENAI_API_KEY)
    throw new BadRequestError('AI text generation is not configured (OPENAI_API_KEY)');
  client ??= new OpenAI({ apiKey: env.OPENAI_API_KEY });
  return client;
};

export interface JsonCompletion<T> {
  data: T;
  model: string;
  usage: { inputTokens: number; outputTokens: number };
}

export const openaiClient = {
  /**
   * Structured generation: the model must return JSON matching `schema`.
   * The response is validated with zod, so callers get typed, trusted data.
   */
  async json<S extends z.ZodType>(opts: {
    schema: S;
    name: string;
    instructions: string;
    input: string;
    model?: string;
    webSearch?: boolean;
  }): Promise<JsonCompletion<z.output<S>>> {
    const model = opts.model ?? env.OPENAI_TEXT_MODEL;
    try {
      const response = await getClient().responses.create({
        model,
        instructions: opts.instructions,
        input: opts.input,
        tools: opts.webSearch ? [{ type: 'web_search' }] : undefined,
        text: {
          format: {
            type: 'json_schema',
            name: opts.name,
            schema: z.toJSONSchema(opts.schema) as Record<string, unknown>,
            strict: false,
          },
        },
      });
      const parsed = opts.schema.safeParse(JSON.parse(response.output_text));
      if (!parsed.success) throw new ExternalServiceError('OpenAI', 'Returned an unexpected shape');
      return {
        data: parsed.data,
        model,
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
        },
      };
    } catch (err) {
      if (err instanceof ExternalServiceError || err instanceof BadRequestError) throw err;
      throw new ExternalServiceError(
        'OpenAI',
        err instanceof Error ? err.message : 'Request failed',
      );
    }
  },

  async image(opts: {
    prompt: string;
    size: string;
    quality: 'medium' | 'high';
  }): Promise<{ data: Buffer; model: string }> {
    try {
      const result = await getClient().images.generate({
        model: env.OPENAI_IMAGE_MODEL,
        prompt: opts.prompt,
        size: opts.size,
        quality: opts.quality,
        n: 1,
      });
      const b64 = result.data?.[0]?.b64_json;
      if (!b64) throw new ExternalServiceError('OpenAI', 'No image returned');
      return { data: Buffer.from(b64, 'base64'), model: env.OPENAI_IMAGE_MODEL };
    } catch (err) {
      if (err instanceof ExternalServiceError || err instanceof BadRequestError) throw err;
      throw new ExternalServiceError(
        'OpenAI',
        err instanceof Error ? err.message : 'Image request failed',
      );
    }
  },
};
