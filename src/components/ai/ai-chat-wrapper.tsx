'use client';

import { useState } from 'react';
import { Sparkles } from 'lucide-react';

import { Button } from '@/components/ui/button';

import { AiChatPanel } from './ai-chat-panel';

interface AiChatWrapperProps {
  courseId: string;
  weekId?: string;
  courseName?: string;
  weekLabel?: string;
  getDocumentContent?: () => string;
}

export function AiChatWrapper({
  courseId,
  weekId,
  courseName,
  weekLabel,
  getDocumentContent,
}: AiChatWrapperProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setIsOpen(!isOpen)}
        className={
          isOpen
            ? 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-800'
            : ''
        }
      >
        <Sparkles className="mr-1.5 h-4 w-4" />
        Ask AI
      </Button>

      <AiChatPanel
        courseId={courseId}
        weekId={weekId}
        courseName={courseName}
        weekLabel={weekLabel}
        getDocumentContent={getDocumentContent}
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
      />
    </>
  );
}
