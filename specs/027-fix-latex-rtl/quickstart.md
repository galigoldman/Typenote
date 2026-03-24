# Quickstart: Fix LaTeX Math Direction in RTL Text

**Branch**: `027-fix-latex-rtl`

## Setup

```bash
git checkout 027-fix-latex-rtl
pnpm install
pnpm dev
```

## Manual Testing

1. Open a document in the editor
2. Type Hebrew text: `עכשיו אני מנסה לראות משוואה באמצע שורה`
3. Insert a LaTeX expression with directional symbols: `y \in S`
4. Verify the math renders as `y ∈ S` (LTR), NOT `S ∋ y` (RTL-mirrored)
5. Try display math with arrows: `\lim_{n \to \infty} \frac{1}{x}`
6. Verify arrows point right (→) not left
7. Export to PDF and verify math direction is preserved

## Key Files to Modify

| File                           | Purpose                                                            |
| ------------------------------ | ------------------------------------------------------------------ |
| `src/app/globals.css`          | Add `.katex { direction: ltr; unicode-bidi: isolate; }` for editor |
| `src/lib/pdf/html-template.ts` | Add same rule to `PROSE_CSS` for PDF export                        |
| `src/lib/pdf/math-renderer.ts` | Add LTR style to hidden measurement container                      |

## Running Tests

```bash
pnpm test          # Unit tests
pnpm lint          # Linting
pnpm build         # Build check
```
