/**
 * CaribClear — AI shared helper (z-ai-web-dev-sdk is a backend-only dependency).
 * SDK is optional at runtime: when the platform key is missing the AI routes
 * degrade to their deterministic paths instead of failing the tenant.
 */
type VisionContent =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }
  | { type: 'file_url'; file_url: { url: string } };

export interface AiCompletion {
  content: string;
  model: string;
}

export async function getAi(): Promise<AiClient | null> {
  try {
    const mod = await import('z-ai-web-dev-sdk');
    const ZAI = (mod as unknown as { default: { create: () => Promise<AiClient> } }).default;
    if (!ZAI || typeof ZAI.create !== 'function') return null;
    const zai = await ZAI.create();
    return zai;
  } catch {
    return null;
  }
}

export interface AiClient {
  chat: {
    completions: {
      create: (body: {
        messages: Array<{ role: string; content: string }>;
        model?: string;
        thinking?: { type: 'enabled' | 'disabled' };
        temperature?: number;
        maxTokens?: number;
      }) => Promise<{ choices?: Array<{ message?: { content?: string } }> }>;
      createVision: (body: {
        model: string;
        messages: Array<{ role: string; content: string | VisionContent[] }>;
        thinking?: { type: 'enabled' | 'disabled' };
      }) => Promise<{ choices?: Array<{ message?: { content?: string } }> }>;
    };
  };
}

export const VISION_MODEL = 'glm-4.5v';
export const TEXT_MODEL = 'glm-4.6';

/** Pull the first JSON object from an LLM answer (handles ```json fences). */
export function extractJson<T>(raw: string): T | null {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}
