import { describe, it, expect } from 'vitest';
import { GET } from './route';
import {
  HELP_WIDGET_ID,
  HELP_BRAND_NAME,
  HELP_BRAND_COLOR,
  HELP_BUBBLE_ICON,
  HELP_BUBBLE_COLOR,
  HELP_MANIFEST_URL,
  HELP_SUGGESTED_QUESTIONS,
} from '@/lib/help/config';

function request(widgetId: string) {
  return GET(
    new Request('http://localhost/api/help/widget-config/' + widgetId),
    {
      params: Promise.resolve({ widgetId }),
    },
  );
}

describe('GET /api/help/widget-config/[widgetId]', () => {
  it('returns the Typenote widget config', async () => {
    const res = await request(HELP_WIDGET_ID);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body).toEqual({
      widgetId: HELP_WIDGET_ID,
      name: HELP_BRAND_NAME,
      brandColor: HELP_BRAND_COLOR,
      bubbleIcon: HELP_BUBBLE_ICON,
      bubbleColor: HELP_BUBBLE_COLOR,
      locale: 'en',
      suggestedQuestions: HELP_SUGGESTED_QUESTIONS,
      manifestUrl: HELP_MANIFEST_URL,
    });
  });

  it('distinguishes the help bubble from the AI chat bubble (icon + color)', async () => {
    const res = await request(HELP_WIDGET_ID);
    const body = await res.json();
    // Help launcher uses a "?" icon + a non-purple color so it is not mistaken
    // for the in-editor AI chat bubble (#6355C0, MessageCircle).
    expect(body.bubbleIcon).toBe('help');
    expect(body.bubbleColor).not.toBe('#6355C0');
  });

  it('shares the manifest URL the help page uses (one bundle, two surfaces)', async () => {
    const res = await request(HELP_WIDGET_ID);
    const body = await res.json();
    expect(body.manifestUrl).toBe('/help/manifest.json');
  });

  it('404s for unknown widget ids', async () => {
    const res = await request('someone-else');
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('widget not found');
  });
});
