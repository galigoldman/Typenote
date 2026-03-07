/**
 * Calls the math translation API to convert natural language
 * math expressions into LaTeX.
 */
export async function translateMathToLatex(text: string): Promise<string> {
  const response = await fetch('/api/math/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error);
  }

  return data.latex;
}
