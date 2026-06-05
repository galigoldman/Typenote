'use client';

import { useEffect, useRef } from 'react';
import { Sigma } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import Image from 'next/image';

interface LaTeXOnboardingProps {
  isFirstTime: boolean;
  isOpen: boolean;
  onDismiss: () => void;
  onToggle: () => void;
}

export function LaTeXOnboarding({
  isFirstTime,
  isOpen,
  onDismiss,
  onToggle,
}: LaTeXOnboardingProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        if (isFirstTime) {
          onDismiss();
        } else {
          onToggle();
        }
      }
    };
    window.addEventListener('pointerdown', handler);
    return () => window.removeEventListener('pointerdown', handler);
  }, [isOpen, isFirstTime, onDismiss, onToggle]);

  return (
    <div className="relative" ref={ref}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onToggle}
            className={isOpen ? 'bg-accent text-accent-foreground' : ''}
            aria-label="LaTeX shortcut"
          >
            <Sigma />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" sideOffset={5}>
          <p>LaTeX shortcut</p>
        </TooltipContent>
      </Tooltip>
      {isOpen && (
        <div
          className="absolute top-full left-1/2 -translate-x-1/2 mt-2 w-60 p-4 bg-popover border rounded-xl shadow-lg z-[100] text-center"
          role="dialog"
          aria-label="LaTeX onboarding"
        >
          <p className="font-semibold text-sm mb-1">Math made easy</p>
          <p className="text-xs text-muted-foreground mb-3">
            Type{' '}
            <kbd className="px-1 py-0.5 bg-muted rounded text-[11px] font-mono">
              {':{'}
            </kbd>{' '}
            to instantly convert text into beautiful equations
          </p>
          <Image
            src="/images/latex-before-after.svg"
            alt="Before and after: typed text becomes a rendered equation"
            width={220}
            height={64}
            className="mx-auto mb-3"
          />
          {isFirstTime && (
            <Button
              type="button"
              variant="default"
              size="sm"
              onClick={onDismiss}
              className="w-full"
            >
              Got it
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
