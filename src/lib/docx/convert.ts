import mammoth from 'mammoth';

export interface DocxConversionResult {
  html: string;
  warnings: string[];
}

export async function convertDocxToHtml(
  buffer: Buffer,
): Promise<DocxConversionResult> {
  if (!buffer || buffer.length === 0) {
    throw new Error(
      'Failed to convert document. The file may be corrupted or in an unsupported format.',
    );
  }

  try {
    const result = await mammoth.convertToHtml({ buffer });

    const warnings = result.messages
      .filter((msg) => msg.type === 'warning')
      .map((msg) => msg.message);

    return {
      html: result.value,
      warnings,
    };
  } catch {
    throw new Error(
      'Failed to convert document. The file may be corrupted or in an unsupported format.',
    );
  }
}
