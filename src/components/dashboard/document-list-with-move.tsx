'use client';

import { useState } from 'react';
import { DocumentCard } from './document-card';
import { MoveDocumentDialog } from './move-document-dialog';
import type { Document } from '@/types/database';

interface DocumentListWithMoveProps {
  documents: Document[];
}

export function DocumentListWithMove({ documents }: DocumentListWithMoveProps) {
  const [moveDoc, setMoveDoc] = useState<Document | null>(null);

  return (
    <>
      {documents.map((doc) => (
        <DocumentCard
          key={doc.id}
          document={doc}
          onMove={() => setMoveDoc(doc)}
        />
      ))}
      <MoveDocumentDialog
        document={moveDoc}
        open={moveDoc !== null}
        onOpenChange={(open) => {
          if (!open) setMoveDoc(null);
        }}
      />
    </>
  );
}
