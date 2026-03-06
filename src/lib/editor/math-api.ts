export async function translateMathToLatex(naturalLanguage: string): Promise<string> {
  const res = await fetch('/api/math/translate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ naturalLanguage }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to translate math expression');
  }

  const data = await res.json();
  return data.latex;
}
