'use client';

import { HelpCenter } from 'daymo/react';
import 'daymo/help-center.css';
import {
  HELP_BRAND_NAME,
  HELP_BRAND_COLOR,
  HELP_MANIFEST_URL,
  HELP_SUGGESTED_QUESTIONS,
} from '@/lib/help/config';

/**
 * Client wrapper around Daymo's <HelpCenter>: the full help page (ask bar
 * with video-moment citations, video-guide gallery, player with a step
 * timeline). Behavior lives in the daymo package; looks are driven by the
 * --daymo-* tokens, re-tinted to Typenote's brand color.
 */
export function HelpCenterClient() {
  return (
    <HelpCenter
      manifestUrl={HELP_MANIFEST_URL}
      chatEndpoint="/api/help/chat"
      name={HELP_BRAND_NAME}
      brandColor={HELP_BRAND_COLOR}
      suggestedQuestions={HELP_SUGGESTED_QUESTIONS}
      contactHref="mailto:galigold2002@gmail.com"
    />
  );
}
