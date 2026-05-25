import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock posthog-js before importing trackEvent
vi.mock('posthog-js', () => ({
  default: {
    capture: vi.fn(),
  },
}));

import posthog from 'posthog-js';
import { trackEvent } from '../events';

describe('trackEvent', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('calls posthog.capture with correct event name and properties', () => {
    trackEvent('document_created', {
      course_id: 'uuid-123',
      document_type: 'notebook',
      purpose: 'homework',
    });

    expect(posthog.capture).toHaveBeenCalledWith('document_created', {
      course_id: 'uuid-123',
      document_type: 'notebook',
      purpose: 'homework',
    });
  });

  it('captures document_deleted with document_id', () => {
    trackEvent('document_deleted', { document_id: 'doc-456' });

    expect(posthog.capture).toHaveBeenCalledWith('document_deleted', {
      document_id: 'doc-456',
    });
  });

  it('captures file_uploaded with file metadata', () => {
    trackEvent('file_uploaded', {
      file_size: 1024000,
      mime_type: 'application/pdf',
    });

    expect(posthog.capture).toHaveBeenCalledWith('file_uploaded', {
      file_size: 1024000,
      mime_type: 'application/pdf',
    });
  });

  it('captures ai_chat_message_sent with mode', () => {
    trackEvent('ai_chat_message_sent', {
      course_id: 'course-1',
      mode: 'deep',
    });

    expect(posthog.capture).toHaveBeenCalledWith('ai_chat_message_sent', {
      course_id: 'course-1',
      mode: 'deep',
    });
  });

  it('captures pdf_exported with page_count', () => {
    trackEvent('pdf_exported', { page_count: 5 });

    expect(posthog.capture).toHaveBeenCalledWith('pdf_exported', {
      page_count: 5,
    });
  });

  it('captures course_created with name length', () => {
    trackEvent('course_created', { course_name_length: 15 });

    expect(posthog.capture).toHaveBeenCalledWith('course_created', {
      course_name_length: 15,
    });
  });

  it('captures document_moved with destination_type', () => {
    trackEvent('document_moved', { destination_type: 'folder' });

    expect(posthog.capture).toHaveBeenCalledWith('document_moved', {
      destination_type: 'folder',
    });
  });

  describe('graceful degradation', () => {
    it('does not throw when posthog.capture is undefined', () => {
      const originalCapture = posthog.capture;
      // @ts-expect-error — simulating PostHog not loaded
      posthog.capture = undefined;

      expect(() => {
        trackEvent('document_created', {
          course_id: null,
          document_type: 'whiteboard',
          purpose: null,
        });
      }).not.toThrow();

      posthog.capture = originalCapture;
    });

    it('does not throw when posthog itself throws', () => {
      vi.mocked(posthog.capture).mockImplementation(() => {
        throw new Error('PostHog network error');
      });

      expect(() => {
        trackEvent('pdf_exported', { page_count: 3 });
      }).not.toThrow();
    });
  });

  describe('SSR safety', () => {
    let originalWindow: typeof globalThis.window;

    beforeEach(() => {
      originalWindow = globalThis.window;
    });

    afterEach(() => {
      // Restore window
      Object.defineProperty(globalThis, 'window', {
        value: originalWindow,
        writable: true,
        configurable: true,
      });
    });

    it('does not call posthog.capture when window is undefined', () => {
      // @ts-expect-error — simulating SSR environment
      delete globalThis.window;

      trackEvent('course_created', { course_name_length: 10 });

      expect(posthog.capture).not.toHaveBeenCalled();
    });
  });
});
