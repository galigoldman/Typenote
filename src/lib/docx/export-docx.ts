import { buildDocxDocument } from './tiptap-to-docx';

export interface DocxExportableDocument {
  title: string;
  content: Record<string, unknown>;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[<>:"/\\|?*]/g, '_').trim() || 'Untitled';
}

export async function exportDocumentAsDocx(
  document: DocxExportableDocument,
): Promise<void> {
  const blob = await buildDocxDocument(document.title, document.content);

  // Trigger download
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = `${sanitizeFilename(document.title)}.docx`;
  window.document.body.appendChild(link);
  link.click();
  window.document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
