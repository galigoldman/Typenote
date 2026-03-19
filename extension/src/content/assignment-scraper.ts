/**
 * Content script for scraping a Moodle assignment page.
 * Injected programmatically via chrome.scripting.executeScript()
 * into the assignment view page (/mod/assign/view.php?id=...).
 *
 * Tested against: Moodle 4.x with calliope theme (moodle.runi.ac.il)
 *
 * Extracts:
 *  - title: from .page-header-headings (h1 or h2) or data-activityname attribute
 *  - descriptionHtml: from .activity-description / #intro
 *  - dueDate: from [data-region="activity-dates"] or .submissionstatustable
 *  - submissionStatus: from .submissionstatustable (th + td cells)
 *  - attachedFiles: PDF/file links found in the description area
 *  - moodleModuleId: from URL ?id= param
 */

export interface ScrapedAssignmentResult {
  title: string;
  descriptionHtml: string;
  dueDate: string | null;
  submissionStatus: string | null;
  attachedFiles: Array<{ name: string; url: string }>;
  moodleModuleId: string;
}

/** Hebrew month names → English for date parsing */
const HEBREW_MONTHS: Record<string, string> = {
  'ינואר': 'January', 'פברואר': 'February', 'מרץ': 'March', 'מרס': 'March',
  'אפריל': 'April', 'מאי': 'May', 'יוני': 'June',
  'יולי': 'July', 'אוגוסט': 'August', 'ספטמבר': 'September',
  'אוקטובר': 'October', 'נובמבר': 'November', 'דצמבר': 'December',
};

/**
 * Parse a Moodle date string that may contain Hebrew day/month names.
 * Strips Hebrew weekday prefix and translates Hebrew month names.
 */
function parseMoodleDate(dateText: string): string | null {
  if (!dateText) return null;

  // Try direct parse first (works for English dates)
  const direct = new Date(dateText);
  if (!isNaN(direct.getTime())) return direct.toISOString();

  // Strip Hebrew weekday prefix (e.g., "יום שלישי, " → "")
  let cleaned = dateText.replace(/^[\u0590-\u05FF\s]+,\s*/, '');

  // Replace Hebrew month names with English
  for (const [he, en] of Object.entries(HEBREW_MONTHS)) {
    cleaned = cleaned.replace(he, en);
  }

  const parsed = new Date(cleaned);
  return isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function scrapeAssignmentPage(): ScrapedAssignmentResult {
  // Title: Moodle uses h1.h2 inside .page-header-headings (not h2)
  const title =
    document.querySelector('.page-header-headings h1')?.textContent?.trim() ??
    document.querySelector('.page-header-headings h2')?.textContent?.trim() ??
    document.querySelector('[data-activityname]')?.getAttribute('data-activityname') ??
    document.title.replace(/ \|.*$/, '').trim();

  // Description: the assignment intro area
  const descriptionEl =
    document.querySelector('#intro') ??
    document.querySelector('.activity-description');

  const descriptionHtml = descriptionEl?.innerHTML?.trim() ?? '';

  // Attached files: PDF and other file links inside the description
  const attachedFiles: Array<{ name: string; url: string }> = [];
  if (descriptionEl) {
    const fileLinks = descriptionEl.querySelectorAll('a[href*="pluginfile.php"]');
    for (const link of fileLinks) {
      const href = (link as HTMLAnchorElement).href;
      const name = link.textContent?.trim() ?? '';
      if (href && name) {
        attachedFiles.push({ name, url: href });
      }
    }
  }

  // Due date: first try [data-region="activity-dates"] (Moodle 4.x),
  // then fall back to .submissionstatustable
  let dueDate: string | null = null;

  // Method 1: activity-dates region (Hebrew: "מסתיים:", English: "Due:")
  const activityDates = document.querySelector('[data-region="activity-dates"]');
  if (activityDates) {
    const dateBlocks = activityDates.querySelectorAll('div');
    for (const block of dateBlocks) {
      const text = block.textContent?.trim() ?? '';
      const strongEl = block.querySelector('strong');
      const label = strongEl?.textContent?.trim() ?? '';
      if (
        label.includes('מסתיים') ||
        label.toLowerCase().includes('due') ||
        label.toLowerCase().includes('end')
      ) {
        // Extract the date text after the label
        const dateText = text.replace(label, '').trim();
        if (dateText) {
          dueDate = parseMoodleDate(dateText);
        }
      }
    }
  }

  // Method 2: submission status table fallback (labels are in <th>, not <td>)
  let submissionStatus: string | null = null;
  const statusTable = document.querySelector('.submissionstatustable table');
  if (statusTable) {
    const rows = statusTable.querySelectorAll('tr');
    for (const row of rows) {
      // Labels can be in <th> or <td> with class "cell c0"
      const headerEl =
        row.querySelector('th.cell.c0') ??
        row.querySelector('td.cell.c0');
      const valueEl =
        row.querySelector('td.cell.c1') ??
        row.querySelector('td.lastcol');
      const header = headerEl?.textContent?.trim() ?? '';
      const value = valueEl?.textContent?.trim() ?? '';

      // Due date from table (if not found in activity-dates)
      if (!dueDate) {
        if (
          header === 'Due date' ||
          header === 'תאריך הגשה' ||
          header.includes('מסתיים')
        ) {
          dueDate = parseMoodleDate(value);
        }
      }

      // Submission status
      if (
        header === 'Submission status' ||
        header === 'מצב ההגשה'
      ) {
        submissionStatus = value || null;
      }
    }
  }

  // Module ID from URL
  const urlParams = new URLSearchParams(window.location.search);
  const moodleModuleId = urlParams.get('id') ?? '';

  return { title, descriptionHtml, dueDate, submissionStatus, attachedFiles, moodleModuleId };
}

(window as unknown as Record<string, unknown>).__typenote_assignment_scraper = scrapeAssignmentPage;
