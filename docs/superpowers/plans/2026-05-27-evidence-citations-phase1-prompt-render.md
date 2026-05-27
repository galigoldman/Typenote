# Evidence Citations — Phase 1: Prompt + Render Hardening — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the AI chat quote its evidence verbatim and cite sources, and harden the answer renderer so a quoted LaTeX fragment or Hebrew text can never break the UI.

**Architecture:** Two small, independent changes — (1) extend the system prompt (`buildSystemPrompt`) to require an inline citation plus an optional verbatim blockquote, and (2) make `MarkdownResponse` resilient to malformed KaTeX (`throwOnError:false`) and set `dir="auto"` for correct RTL/Hebrew rendering. Ships with no DB/migration changes and works on today's whole-file chunks; page numbers arrive in Phase 2.

**Tech Stack:** TypeScript, Next.js 16, React 19, `react-markdown` + `remark-math` + `rehype-katex` (KaTeX), Vitest + Testing Library.

**Spec:** `docs/superpowers/specs/2026-05-27-evidence-citations-design.md` (§4.5, §10 phase 1).

---

## File structure

- `src/lib/ai/prompts.ts` — MODIFY `buildSystemPrompt` (response guidelines: evidence quote + citation).
- `src/lib/ai/__tests__/prompts.test.ts` — CREATE (or extend if it exists) unit tests for the new prompt text.
- `src/components/ai/markdown-response.tsx` — MODIFY (KaTeX `throwOnError:false`, `dir="auto"`).
- `src/components/ai/__tests__/markdown-response.test.tsx` — EXTEND with malformed-math + RTL tests.

---

### Task 1: Evidence-quote + citation instruction in the system prompt

**Files:**
- Modify: `src/lib/ai/prompts.ts` (function `buildSystemPrompt`, the `## RESPONSE GUIDELINES` block)
- Test: `src/lib/ai/__tests__/prompts.test.ts` (create if missing)

- [ ] **Step 1: Check whether a prompts test already exists**

Run: `ls src/lib/ai/__tests__/prompts.test.ts 2>/dev/null && echo EXISTS || echo MISSING`
If EXISTS, add the `describe` block below to it instead of creating the file.

- [ ] **Step 2: Write the failing test**

Create `src/lib/ai/__tests__/prompts.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { buildSystemPrompt } from '../prompts';

describe('buildSystemPrompt — evidence citations', () => {
  it('instructs the model to quote evidence verbatim in a blockquote', () => {
    const prompt = buildSystemPrompt({ hasDocumentContent: false });
    expect(prompt.toLowerCase()).toContain('blockquote');
    expect(prompt).toMatch(/quote/i);
  });

  it('instructs an inline citation with optional page', () => {
    const prompt = buildSystemPrompt({ hasDocumentContent: false });
    // The literal citation template the model must follow.
    expect(prompt).toContain('(Material name');
    expect(prompt).toMatch(/p\.\s*N/);
  });

  it('tells the model NOT to fabricate a quote for image-only pages', () => {
    const prompt = buildSystemPrompt({ hasDocumentContent: false });
    expect(prompt.toLowerCase()).toContain('without a blockquote');
    expect(prompt).toMatch(/never invent|do not invent|never fabricate/i);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm test -- src/lib/ai/__tests__/prompts.test.ts`
Expected: FAIL (current prompt has no "blockquote" / "(Material name" text).

- [ ] **Step 4: Implement — replace guideline 5 in `buildSystemPrompt`**

In `src/lib/ai/prompts.ts`, replace this exact block:

```ts
5. **Source citations format.** When you referenced course materials, list them at the end:
[Sources]
- Material Name: brief description of what was referenced
```

with:

```ts
5. **Cite with evidence.** When a claim comes from the course materials:
   - Attribute it inline as \`(Material name, p. N)\`. Use the page number **only if it appears in the material's header** (e.g. \`--- Notes.pdf (p. 7) ---\`); otherwise cite the name alone.
   - When the material contains the exact supporting sentence, quote it **verbatim** in a markdown blockquote (\`> ...\`) right before or after the claim.
   - If a page has no faithful text to quote (e.g. an image-only or figure slide), cite the page **without a blockquote** — **never invent a quote** or paraphrase inside quotation marks.
   Then list everything you referenced at the end:
[Sources]
- Material Name: brief description of what was referenced
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm test -- src/lib/ai/__tests__/prompts.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai/prompts.ts src/lib/ai/__tests__/prompts.test.ts
git commit -m "feat(ai): prompt for verbatim evidence quotes + inline citations

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: Harden `MarkdownResponse` (KaTeX errors + RTL)

**Files:**
- Modify: `src/components/ai/markdown-response.tsx`
- Test: `src/components/ai/__tests__/markdown-response.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append to `src/components/ai/__tests__/markdown-response.test.tsx` (before the final closing of the file, after the existing `describe` blocks):

```tsx
describe('MarkdownResponse — resilience & RTL', () => {
  it('does not throw on a malformed/unterminated LaTeX fragment', () => {
    // A broken quote fragment a chunk boundary could produce.
    const content = 'Here is the proof:\n\n$$\n\\frac{-b \\pm \\sqrt{b^2\n$$\n\nend';
    expect(() =>
      render(<MarkdownResponse content={content} />),
    ).not.toThrow();
  });

  it('sets dir="auto" so Hebrew renders right-to-left', () => {
    const { container } = render(
      <MarkdownResponse content="זוהי תשובה בעברית (Notes.pdf)" />,
    );
    expect(container.firstChild).toHaveAttribute('dir', 'auto');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm test -- src/components/ai/__tests__/markdown-response.test.tsx`
Expected: FAIL — the malformed-math test throws (KaTeX default `throwOnError:true`), and the `dir` test fails (no attribute).

- [ ] **Step 3: Implement — update `markdown-response.tsx`**

Replace the body of the component (the `return (...)`) in `src/components/ai/markdown-response.tsx` with:

```tsx
  return (
    <div
      dir="auto"
      className="prose prose-sm dark:prose-invert max-w-none leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
    >
      <Markdown
        remarkPlugins={[remarkMath]}
        rehypePlugins={[[rehypeKatex, { throwOnError: false, strict: false }]]}
      >
        {content}
      </Markdown>
    </div>
  );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm test -- src/components/ai/__tests__/markdown-response.test.tsx`
Expected: PASS (all existing tests + the 2 new ones). The existing KaTeX rendering tests still pass because valid math is unaffected by `throwOnError:false`.

- [ ] **Step 5: Commit**

```bash
git add src/components/ai/markdown-response.tsx src/components/ai/__tests__/markdown-response.test.tsx
git commit -m "fix(ai): KaTeX throwOnError:false + dir=auto for safe Hebrew/math answers

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Verify the full suite

- [ ] **Step 1: Run unit + integration tests**

Run: `pnpm test && pnpm test:integration`
Expected: PASS. (No new E2E in Phase 1 — evidence quotes are exercised end-to-end by the Phase 2 E2E task; if you want an early check, run the existing AI chat E2E to confirm no regression: `pnpm test:e2e -- e2e/ai-chat`.)

- [ ] **Step 2: Lint + format + build**

Run: `pnpm lint && pnpm build`
Expected: PASS.

---

## Self-review notes

- **Spec coverage (§4.5):** evidence quote (optional) ✓ Task 1; always-inline citation ✓ Task 1; omit quote on image pages ✓ Task 1; KaTeX `throwOnError:false` ✓ Task 2; `dir="auto"` ✓ Task 2.
- **Forward-compatibility:** the prompt says "use the page only if it appears in the material header" — harmless in Phase 1 (no pages yet, model cites name only) and activates automatically once Phase 2 puts pages in the header. No prompt rework needed later.
- **Deferred to Phase 2:** LTR-isolating the inline citation glyphs inside Hebrew prose (the `dir="auto"` base-direction fix covers the common case; per-span isolation is a refinement, not a blocker).
