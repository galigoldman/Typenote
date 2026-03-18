import type { QuestionBoundary } from '@/types/assignments';
import { buildQuestionSplitPrompt } from './prompts';

export function parseAiSplitResponse(
  aiResponse: string,
  htmlLength?: number,
): QuestionBoundary[] {
  try {
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON found');
    const parsed = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
      throw new Error('No questions array');
    }
    return parsed.questions.map((q: Record<string, unknown>, i: number) => ({
      label: String(q.label ?? `${i + 1}`),
      position: Number(q.position ?? i),
      boundaryStart: Number(q.boundary_start ?? 0),
      boundaryEnd: Number(q.boundary_end ?? 0),
      parentLabel: q.parent_label ? String(q.parent_label) : undefined,
      preambleStart: q.preamble_start != null ? Number(q.preamble_start) : undefined,
      preambleEnd: q.preamble_end != null ? Number(q.preamble_end) : undefined,
      lowConfidence: Boolean(q.low_confidence),
    }));
  } catch {
    return [{ label: '1', position: 0, boundaryStart: 0, boundaryEnd: htmlLength ?? 0, lowConfidence: true }];
  }
}

export function snapBoundariesToElements(
  boundaries: QuestionBoundary[],
  html: string,
): QuestionBoundary[] {
  const validPositions = [0];
  const tagRegex = /<\/[a-z][a-z0-9]*>/gi;
  let match;
  while ((match = tagRegex.exec(html)) !== null) {
    validPositions.push(match.index + match[0].length);
  }
  validPositions.push(html.length);

  const snap = (pos: number): number => {
    let closest = validPositions[0];
    for (const vp of validPositions) {
      if (Math.abs(vp - pos) < Math.abs(closest - pos)) closest = vp;
    }
    return closest;
  };

  return boundaries.map((b) => ({
    ...b,
    boundaryStart: snap(b.boundaryStart),
    boundaryEnd: snap(b.boundaryEnd),
    preambleStart: b.preambleStart != null ? snap(b.preambleStart) : undefined,
    preambleEnd: b.preambleEnd != null ? snap(b.preambleEnd) : undefined,
  }));
}

export async function splitAssignmentWithAi(
  descriptionHtml: string,
): Promise<QuestionBoundary[]> {
  const { GoogleGenAI } = await import('@google/genai');
  const ai = new GoogleGenAI({ apiKey: process.env.GOOGLE_AI_API_KEY! });
  const prompt = buildQuestionSplitPrompt(descriptionHtml);
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
  });
  const text = response.text ?? '';
  const boundaries = parseAiSplitResponse(text, descriptionHtml.length);
  return snapBoundariesToElements(boundaries, descriptionHtml);
}
