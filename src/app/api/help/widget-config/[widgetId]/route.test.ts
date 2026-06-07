import { describe, it, expect } from 'vitest';
import { GET } from './route';
import {
  HELP_WIDGET_ID,
  HELP_BRAND_NAME,
  HELP_BRAND_COLOR,
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
      locale: 'en',
      suggestedQuestions: HELP_SUGGESTED_QUESTIONS,
      manifestUrl: HELP_MANIFEST_URL,
    });
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
