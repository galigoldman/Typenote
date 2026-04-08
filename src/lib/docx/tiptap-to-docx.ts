import {
  Document,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  ExternalHyperlink,
  Math as DocxMath,
  MathRun,
  TabStopPosition,
  TabStopType,
  LevelFormat,
  convertInchesToTwip,
  Packer,
  ShadingType,
  BorderStyle,
  type IParagraphOptions,
  type IRunOptions,
} from 'docx';

// ---------------------------------------------------------------------------
// TipTap JSON types (mirrors the ProseMirror document model)
// ---------------------------------------------------------------------------

interface TipTapMark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface TipTapNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: TipTapNode[];
  marks?: TipTapMark[];
  text?: string;
}

// ---------------------------------------------------------------------------
// Mark resolution
// ---------------------------------------------------------------------------

interface ResolvedMarks {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  code: boolean;
  link: string | null;
  highlight: string | null;
}

function resolveMarks(marks?: TipTapMark[]): ResolvedMarks {
  const result: ResolvedMarks = {
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    code: false,
    link: null,
    highlight: null,
  };
  if (!marks) return result;
  for (const m of marks) {
    switch (m.type) {
      case 'bold':
        result.bold = true;
        break;
      case 'italic':
        result.italic = true;
        break;
      case 'underline':
        result.underline = true;
        break;
      case 'strike':
        result.strikethrough = true;
        break;
      case 'code':
        result.code = true;
        break;
      case 'link':
        result.link = (m.attrs?.href as string) ?? null;
        break;
      case 'highlight':
        result.highlight = (m.attrs?.color as string) ?? '#FBBF24';
        break;
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// Heading level mapping
// ---------------------------------------------------------------------------

const HEADING_MAP: Record<
  number,
  (typeof HeadingLevel)[keyof typeof HeadingLevel]
> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
};

// ---------------------------------------------------------------------------
// Alignment mapping
// ---------------------------------------------------------------------------

function mapAlignment(
  textAlign?: string | null,
): (typeof AlignmentType)[keyof typeof AlignmentType] | undefined {
  switch (textAlign) {
    case 'center':
      return AlignmentType.CENTER;
    case 'right':
      return AlignmentType.RIGHT;
    case 'justify':
      return AlignmentType.JUSTIFIED;
    default:
      return undefined;
  }
}

// ---------------------------------------------------------------------------
// LaTeX to OMML conversion
//
// Word uses OMML (Office Math Markup Language) for equations.
// The `docx` library supports Math and MathRun for simple expressions.
// For complex LaTeX, we do a best-effort conversion and fall back to
// plain text if the expression is too complex.
// ---------------------------------------------------------------------------

function latexToMathRuns(latex: string): DocxMath {
  // Simple approach: wrap the LaTeX in a MathRun
  // Word will interpret common symbols. For complex LaTeX,
  // this provides a readable fallback.
  return new DocxMath({
    children: [new MathRun(latex)],
  });
}

// ---------------------------------------------------------------------------
// Inline content conversion — text nodes + math expressions
// ---------------------------------------------------------------------------

function convertInlineContent(
  nodes: TipTapNode[] | undefined,
): (TextRun | ExternalHyperlink | DocxMath)[] {
  if (!nodes) return [];
  const runs: (TextRun | ExternalHyperlink | DocxMath)[] = [];

  for (const node of nodes) {
    if (node.type === 'mathExpression') {
      const latex = (node.attrs?.latex as string) ?? '';
      if (latex) {
        runs.push(latexToMathRuns(latex));
      }
      continue;
    }

    if (node.type === 'hardBreak') {
      runs.push(new TextRun({ break: 1 }));
      continue;
    }

    if (node.type !== 'text' || !node.text) continue;

    const marks = resolveMarks(node.marks);
    const runOptions: IRunOptions = {
      text: node.text,
      bold: marks.bold || undefined,
      italics: marks.italic || undefined,
      underline: marks.underline ? {} : undefined,
      strike: marks.strikethrough || undefined,
      font: marks.code ? { name: 'Courier New' } : undefined,
      size: marks.code ? 20 : undefined, // 10pt for code
      shading: marks.highlight
        ? {
            type: ShadingType.SOLID,
            color: marks.highlight.replace('#', ''),
            fill: marks.highlight.replace('#', ''),
          }
        : undefined,
    };

    if (marks.link) {
      runs.push(
        new ExternalHyperlink({
          children: [
            new TextRun({
              ...runOptions,
              style: 'Hyperlink',
            }),
          ],
          link: marks.link,
        }),
      );
    } else {
      runs.push(new TextRun(runOptions));
    }
  }

  return runs;
}

// ---------------------------------------------------------------------------
// Block node conversion
// ---------------------------------------------------------------------------

function convertNode(node: TipTapNode, depth: number = 0): Paragraph[] {
  switch (node.type) {
    case 'heading':
      return convertHeading(node);

    case 'paragraph':
      return convertParagraph(node);

    case 'bulletList':
      return convertBulletList(node, depth);

    case 'orderedList':
      return convertOrderedList(node, depth);

    case 'taskList':
      return convertTaskList(node, depth);

    case 'codeBlock':
      return convertCodeBlock(node);

    case 'blockquote':
      return convertBlockquote(node, depth);

    case 'horizontalRule':
      return convertHorizontalRule();

    default:
      // Unknown node — try to convert children
      if (node.content) {
        return node.content.flatMap((child) => convertNode(child, depth));
      }
      return [];
  }
}

function convertHeading(node: TipTapNode): Paragraph[] {
  const level = (node.attrs?.level as number) ?? 1;
  const textAlign = node.attrs?.textAlign as string | null;
  const children = convertInlineContent(node.content);

  return [
    new Paragraph({
      heading: HEADING_MAP[level] ?? HeadingLevel.HEADING_1,
      alignment: mapAlignment(textAlign),
      children,
      spacing: {
        before: level === 1 ? 0 : level === 2 ? 240 : 120,
        after: level === 1 ? 240 : level === 2 ? 160 : 120,
      },
    }),
  ];
}

function convertParagraph(node: TipTapNode): Paragraph[] {
  const textAlign = node.attrs?.textAlign as string | null;
  const children = convertInlineContent(node.content);

  // Empty paragraph = blank line (preserve spacing)
  if (children.length === 0) {
    return [
      new Paragraph({
        alignment: mapAlignment(textAlign),
        spacing: { after: 200 },
        children: [new TextRun('')],
      }),
    ];
  }

  return [
    new Paragraph({
      alignment: mapAlignment(textAlign),
      spacing: { after: 200, line: 360 }, // 1.5 line spacing, ~20pt after
      children,
    }),
  ];
}

function convertBulletList(node: TipTapNode, depth: number): Paragraph[] {
  if (!node.content) return [];
  return node.content.flatMap((listItem) => {
    const paragraphs: Paragraph[] = [];
    if (listItem.content) {
      for (let i = 0; i < listItem.content.length; i++) {
        const child = listItem.content[i];
        if (child.type === 'paragraph') {
          const children = convertInlineContent(child.content);
          paragraphs.push(
            new Paragraph({
              bullet: { level: depth },
              spacing: { after: 80 },
              children,
            }),
          );
        } else if (
          child.type === 'bulletList' ||
          child.type === 'orderedList' ||
          child.type === 'taskList'
        ) {
          paragraphs.push(...convertNode(child, depth + 1));
        }
      }
    }
    return paragraphs;
  });
}

function convertOrderedList(node: TipTapNode, depth: number): Paragraph[] {
  if (!node.content) return [];
  return node.content.flatMap((listItem) => {
    const paragraphs: Paragraph[] = [];
    if (listItem.content) {
      for (const child of listItem.content) {
        if (child.type === 'paragraph') {
          const children = convertInlineContent(child.content);
          paragraphs.push(
            new Paragraph({
              numbering: { reference: 'ordered-list', level: depth },
              spacing: { after: 80 },
              children,
            }),
          );
        } else if (
          child.type === 'bulletList' ||
          child.type === 'orderedList' ||
          child.type === 'taskList'
        ) {
          paragraphs.push(...convertNode(child, depth + 1));
        }
      }
    }
    return paragraphs;
  });
}

function convertTaskList(node: TipTapNode, depth: number): Paragraph[] {
  if (!node.content) return [];
  return node.content.flatMap((taskItem) => {
    const checked = (taskItem.attrs?.checked as boolean) ?? false;
    const checkbox = checked ? '☑ ' : '☐ ';
    const paragraphs: Paragraph[] = [];
    if (taskItem.content) {
      for (const child of taskItem.content) {
        if (child.type === 'paragraph') {
          const inlineRuns = convertInlineContent(child.content);
          paragraphs.push(
            new Paragraph({
              indent: { left: convertInchesToTwip(0.25 * (depth + 1)) },
              spacing: { after: 80 },
              children: [new TextRun({ text: checkbox }), ...inlineRuns],
            }),
          );
        } else if (
          child.type === 'bulletList' ||
          child.type === 'orderedList' ||
          child.type === 'taskList'
        ) {
          paragraphs.push(...convertNode(child, depth + 1));
        }
      }
    }
    return paragraphs;
  });
}

function convertCodeBlock(node: TipTapNode): Paragraph[] {
  const text =
    node.content
      ?.filter((c) => c.type === 'text')
      .map((c) => c.text ?? '')
      .join('') ?? '';

  // Split by newlines and create a paragraph per line
  const lines = text.split('\n');
  return lines.map(
    (line) =>
      new Paragraph({
        shading: {
          type: ShadingType.SOLID,
          color: 'F3F4F6',
          fill: 'F3F4F6',
        },
        spacing: { after: 0, line: 300 },
        children: [
          new TextRun({
            text: line || ' ', // Empty line needs a space to preserve height
            font: { name: 'Courier New' },
            size: 20, // 10pt
          }),
        ],
      }),
  );
}

function convertBlockquote(node: TipTapNode, depth: number): Paragraph[] {
  if (!node.content) return [];
  return node.content.flatMap((child) => {
    const paragraphs = convertNode(child, depth);
    // Add left border and indent to blockquote paragraphs
    return paragraphs.map(
      (p) =>
        new Paragraph({
          ...p,
          indent: { left: convertInchesToTwip(0.5) },
          border: {
            left: {
              style: BorderStyle.SINGLE,
              size: 6,
              color: '9CA3AF',
              space: 8,
            },
          },
        }),
    );
  });
}

function convertHorizontalRule(): Paragraph[] {
  return [
    new Paragraph({
      border: {
        bottom: {
          style: BorderStyle.SINGLE,
          size: 6,
          color: 'D1D5DB',
          space: 8,
        },
      },
      spacing: { before: 200, after: 200 },
    }),
  ];
}

// ---------------------------------------------------------------------------
// Public API — convert full TipTap document to DOCX paragraphs
// ---------------------------------------------------------------------------

export function convertTipTapToDocx(tiptapDoc: TipTapNode): Paragraph[] {
  if (!tiptapDoc.content) return [];
  return tiptapDoc.content.flatMap((node) => convertNode(node));
}

// ---------------------------------------------------------------------------
// Build and export complete DOCX document
// ---------------------------------------------------------------------------

export async function buildDocxDocument(
  title: string,
  tiptapContent: Record<string, unknown>,
): Promise<Blob> {
  const paragraphs = convertTipTapToDocx(
    tiptapContent as unknown as TipTapNode,
  );

  const doc = new Document({
    title,
    numbering: {
      config: [
        {
          reference: 'ordered-list',
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: '%1.',
              alignment: AlignmentType.START,
            },
            {
              level: 1,
              format: LevelFormat.LOWER_LETTER,
              text: '%2.',
              alignment: AlignmentType.START,
            },
            {
              level: 2,
              format: LevelFormat.LOWER_ROMAN,
              text: '%3.',
              alignment: AlignmentType.START,
            },
          ],
        },
      ],
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1),
            },
          },
        },
        children: [
          // Document title as Heading 1
          new Paragraph({
            heading: HeadingLevel.TITLE,
            spacing: { after: 400 },
            children: [
              new TextRun({
                text: title,
                bold: true,
                size: 52, // 26pt
              }),
            ],
          }),
          ...paragraphs,
        ],
      },
    ],
  });

  return await Packer.toBlob(doc);
}
