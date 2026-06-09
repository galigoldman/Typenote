import { NextResponse } from 'next/server';
import {
  HELP_WIDGET_ID,
  HELP_BRAND_NAME,
  HELP_BRAND_COLOR,
  HELP_BUBBLE_ICON,
  HELP_BUBBLE_COLOR,
  HELP_MANIFEST_URL,
  HELP_SUGGESTED_QUESTIONS,
} from '@/lib/help/config';

/**
 * Static widget configuration the Daymo chat widget fetches on mount
 * (GET {data-base-url}/widget-config/{widgetId}). Typenote runs a single
 * widget, so this is a constant — no database involved.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ widgetId: string }> },
): Promise<NextResponse> {
  const { widgetId } = await params;
  if (widgetId !== HELP_WIDGET_ID) {
    return NextResponse.json({ error: 'widget not found' }, { status: 404 });
  }
  return NextResponse.json({
    widgetId: HELP_WIDGET_ID,
    name: HELP_BRAND_NAME,
    brandColor: HELP_BRAND_COLOR,
    bubbleIcon: HELP_BUBBLE_ICON,
    bubbleColor: HELP_BUBBLE_COLOR,
    locale: 'en',
    suggestedQuestions: HELP_SUGGESTED_QUESTIONS,
    manifestUrl: HELP_MANIFEST_URL,
  });
}
