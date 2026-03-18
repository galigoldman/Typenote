/**
 * Content script for scraping a Moodle assignment page.
 * Injected programmatically via chrome.scripting.executeScript()
 * into the assignment view page (/mod/assign/view.php?id=...).
 *
 * Extracts:
 *  - title: from .page-header-headings h2 or data-activityname attribute
 *  - descriptionHtml: from .activity-description .no-overflow or #intro
 *  - dueDate: from .submissionstatustable tr cells (English + Hebrew labels)
 *  - moodleModuleId: from URL ?id= param
 */

export function scrapeAssignmentPage(): {
  title: string;
  descriptionHtml: string;
  dueDate: string | null;
  moodleModuleId: string;
} {
  const title =
    document.querySelector('.page-header-headings h2')?.textContent?.trim() ??
    document.querySelector('[data-activityname]')?.getAttribute('data-activityname') ??
    document.title.replace(/ \|.*$/, '').trim();

  const descriptionEl =
    document.querySelector('.activity-description .no-overflow') ??
    document.querySelector('#intro') ??
    document.querySelector('.submissionstatustable')?.previousElementSibling;

  const descriptionHtml = descriptionEl?.innerHTML?.trim() ?? '';

  let dueDate: string | null = null;
  const rows = document.querySelectorAll('.submissionstatustable tr');
  for (const row of rows) {
    const header = row.querySelector('td.cell.c0')?.textContent?.trim();
    if (header === 'Due date' || header === 'תאריך הגשה') {
      const dateText = row.querySelector('td.cell.c1')?.textContent?.trim();
      if (dateText) {
        const parsed = new Date(dateText);
        dueDate = isNaN(parsed.getTime()) ? null : parsed.toISOString();
      }
    }
  }

  const urlParams = new URLSearchParams(window.location.search);
  const moodleModuleId = urlParams.get('id') ?? '';

  return { title, descriptionHtml, dueDate, moodleModuleId };
}

(window as unknown as Record<string, unknown>).__typenote_assignment_scraper = scrapeAssignmentPage;
