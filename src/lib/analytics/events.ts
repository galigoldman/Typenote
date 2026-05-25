import posthog from 'posthog-js';

/**
 * Discriminated union of all custom analytics events.
 * Each event name is paired with its required properties,
 * enforced at the type level so invalid combinations are compile errors.
 */
type AnalyticsEventMap = {
  document_created: {
    course_id: string | null;
    document_type: string;
    purpose: string | null;
  };
  document_deleted: {
    document_id: string;
  };
  file_uploaded: {
    file_size: number;
    mime_type: string;
  };
  ai_chat_message_sent: {
    course_id: string | undefined;
    mode: 'quick' | 'deep';
  };
  pdf_exported: {
    page_count: number;
  };
  course_created: {
    course_name_length: number;
  };
  document_moved: {
    destination_type: 'folder' | 'course' | 'root';
  };
  personal_file_uploaded: {
    file_size: number;
    mime_type: string;
    course_id: string;
  };
  personal_file_deleted: {
    file_id: string;
    course_id: string;
  };
};

export type AnalyticsEventName = keyof AnalyticsEventMap;

/**
 * Capture a custom analytics event with typed properties.
 * Gracefully degrades — never throws if PostHog is unavailable
 * (e.g. ad blocker, SSR, or SDK not loaded).
 */
export function trackEvent<K extends AnalyticsEventName>(
  event: K,
  properties: AnalyticsEventMap[K],
): void {
  try {
    if (typeof window !== 'undefined' && posthog?.capture) {
      posthog.capture(event, properties);
    }
  } catch {
    // Silent failure: analytics must never break the app (FR-010)
  }
}
