import { google } from '@ai-sdk/google';
import type { LanguageModelV2 } from 'ai';

// Mock model that always returns a fixed LaTeX expression
// Used for initial development and testing
class MockLatexModel {
  readonly specificationVersion = 'v2' as const;
  readonly modelId = 'mock-latex';
  readonly provider = 'mock';
  readonly defaultObjectGenerationMode = undefined;

  async doGenerate() {
    const text = '\\frac{1}{2} \\times 5';
    return {
      rawCall: { rawPrompt: null, rawSettings: {} },
      finishReason: 'stop' as const,
      usage: { inputTokens: 10, outputTokens: 5 },
      text,
      content: [{ type: 'text' as const, text }],
      toolCalls: [],
      warnings: [],
    };
  }

  async doStream() {
    throw new Error('Streaming not supported in mock model');
  }
}

export function getModel(): LanguageModelV2 {
  if (process.env.USE_MOCK_AI !== 'false') {
    return new MockLatexModel() as unknown as LanguageModelV2;
  }

  return google('gemini-2.5-flash');
}
