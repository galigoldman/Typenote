/**
 * Content script for scraping Moodle pages.
 * Injected programmatically via chrome.scripting.executeScript()
 * only into the student's Moodle instance.
 *
 * DOM patterns discovered from live Moodle instance (Reichman University,
 * Moodle 2026 with "calliope" theme + tiles format plugin).
 *
 * Key selectors:
 *  - Courses page: .card.dashboard-card[data-course-id]
 *  - Tile sections: li.tile[data-section][data-true-sectionid]
 *  - Standard sections: li.section[data-sectionid], #section-{n}
 *  - Activities: .activity.activity-wrapper[data-for="cmitem"]
 *  - Activity data: data-id, data-cmid, data-modtype, data-title
 *  - Login marker: .usermenu + logout link
 */

import type {
  LoginStatusData,
  ScrapedCourse,
  ScrapedCoursesData,
  ScrapedSection,
  ScrapedItem,
  ScrapedCourseContentData,
} from '../types/messages';

// ============================================
// Login detection
// ============================================

/**
 * Checks whether the user is logged into Moodle by looking for
 * the user menu and a logout link in the DOM.
 */
export function scrapeLoginStatus(): LoginStatusData {
  const hasUserMenu = !!document.querySelector(
    '.usermenu, #user-menu-toggle, .userbutton',
  );
  const hasLogoutLink = !!document.querySelector(
    'a[href*="logout.php"], a[data-title="logout,moodle"]',
  );
  // Moodle sets M.cfg.sesskey for authenticated users
  const hasSesskey =
    typeof (window as unknown as Record<string, unknown>).M !== 'undefined' &&
    !!(
      (window as unknown as Record<string, { cfg?: { sesskey?: string } }>)
        .M?.cfg?.sesskey
    );

  return { loggedIn: hasUserMenu && (hasLogoutLink || hasSesskey) };
}

// ============================================
// Course list scraping (/my/courses.php)
// ============================================

/**
 * Scrapes enrolled courses from the Moodle "My courses" page.
 *
 * DOM structure (dashboard card view):
 *   .card.dashboard-card[data-course-id="2601225"]
 *     a.course-link[href="/course/view.php?id=2601225"]
 *     .multiline
 *       span[aria-hidden="true"]  ->  visible course name
 *       span.sr-only              ->  accessible course name (fallback)
 */
export function scrapeCourses(): ScrapedCoursesData & { _debug?: { title: string; url: string; cardCount: number } } {
  const cards = document.querySelectorAll<HTMLElement>(
    '.card.dashboard-card[data-course-id]',
  );
  const courses: ScrapedCourse[] = [];

  cards.forEach((card) => {
    const moodleCourseId = card.dataset.courseId;
    if (!moodleCourseId) return;

    // Extract course name from .multiline area
    // Primary: span[aria-hidden="true"] has the visible display name
    // Fallback: span.sr-only has the accessible name
    // Final fallback: .coursename last non-empty text line
    let name = '';
    const multiline = card.querySelector('.multiline');
    if (multiline) {
      const ariaHidden = multiline.querySelector('span[aria-hidden="true"]');
      const srOnly = multiline.querySelector('.sr-only');
      name = (ariaHidden?.textContent || srOnly?.textContent || '').trim();
    }
    if (!name) {
      const coursename = card.querySelector('.coursename');
      if (coursename) {
        const lines = coursename.textContent
          ?.split('\n')
          .map((s) => s.trim())
          .filter(Boolean);
        name = lines?.pop() ?? '';
      }
    }

    const linkEl = card.querySelector<HTMLAnchorElement>(
      'a[href*="/course/view.php"]',
    );
    const url = linkEl?.href ?? '';

    if (name && url) {
      courses.push({ moodleCourseId, name, url });
    }
  });

  return {
    courses,
    _debug: {
      title: document.title,
      url: window.location.href,
      cardCount: cards.length,
    },
  };
}

// ============================================
// Course content scraping (single course page)
// ============================================

/**
 * Determines the course format from the body class.
 * Common formats: 'tiles', 'topics', 'weeks', 'singleactivity'
 */
function getCourseFormat(): string {
  const match = document.body.className.match(/format-(\w+)/);
  return match?.[1] ?? 'unknown';
}

/**
 * Extracts file type from the activity's class list.
 * Moodle uses classes like: modtype_resource_pdf, modtype_pdf, modtype_resource
 * We want the file extension (pdf, docx, etc.)
 */
function extractFileType(classes: string): string | undefined {
  // Check for specific file extension in modtype classes
  // Handles both "modtype_pdf" and "modtype_resource_pdf" patterns
  const subtypeMatch = classes.match(
    /modtype_(?:resource_)?(pdf|pptx?|docx?|xlsx?|zip|rar|png|jpe?g|gif|mp4|mp3)/,
  );
  if (subtypeMatch) return subtypeMatch[1];

  // Check icon alt text via the modtype class
  const modMatch = classes.match(/modtype_(\w+)/);
  return modMatch?.[1] ?? undefined;
}

/**
 * Determines the MIME type from a file extension string.
 */
function mimeFromExtension(ext: string): string | undefined {
  const map: Record<string, string> = {
    pdf: 'application/pdf',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    zip: 'application/zip',
    rar: 'application/x-rar-compressed',
    png: 'image/png',
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    gif: 'image/gif',
    mp4: 'video/mp4',
    mp3: 'audio/mpeg',
  };
  return map[ext.toLowerCase()];
}

/**
 * Parses a single activity element into a ScrapedItem.
 *
 * Activity DOM structure (.activity.activity-wrapper):
 *   data-for="cmitem"
 *   data-id / data-cmid  -> Moodle course module ID
 *   data-modtype          -> e.g. "resource_pdf", "url", "lti"
 *   data-title            -> display name
 *   .activityname a       -> link + name
 *   img.activityicon      -> icon with alt text ("File icon", "URL icon")
 */
function parseActivity(activity: HTMLElement): ScrapedItem | null {
  const nameEl = activity.querySelector<HTMLAnchorElement>('.activityname a');
  if (!nameEl) return null;

  const name = nameEl.textContent?.trim() ?? '';
  const moodleUrl = nameEl.href ?? '';
  const modType = activity.dataset.modtype ?? '';
  const iconAlt =
    activity.querySelector<HTMLImageElement>('img.activityicon')?.alt ?? '';
  const classes = activity.className;

  // Determine if this is a file or a link
  const isFile =
    modType.startsWith('resource') ||
    classes.includes('modtype_resource') ||
    iconAlt === 'File icon';
  const isUrl =
    modType === 'url' ||
    classes.includes('modtype_url') ||
    iconAlt === 'URL icon';

  // Skip non-importable activities (forums, quizzes, assignments, LTI tools)
  const skipTypes = [
    'forum',
    'assign',
    'quiz',
    'lti',
    'questionnaire',
    'choice',
    'feedback',
    'workshop',
    'lesson',
    'scorm',
    'glossary',
    'wiki',
    'data',
    'chat',
    'survey',
  ];
  const baseModType = modType.split('_')[0];
  if (!isFile && !isUrl && skipTypes.includes(baseModType)) {
    return null;
  }

  // For files: extract file extension from modtype or icon
  const fileExt = extractFileType(classes);
  const mimeType = fileExt ? mimeFromExtension(fileExt) : undefined;

  const item: ScrapedItem = {
    type: isUrl ? 'link' : 'file',
    name,
    moodleUrl,
  };

  if (isUrl) {
    // For URL resources, the actual external URL is behind the Moodle redirect
    // The extension will resolve it when downloading
    item.externalUrl = moodleUrl;
  }

  if (mimeType) {
    item.mimeType = mimeType;
  }

  return item;
}

/**
 * Scrapes activities from a section element.
 */
function scrapeActivitiesFromSection(
  sectionEl: HTMLElement,
): ScrapedItem[] {
  // Select only the wrapper activities (not the nested .activity-item duplicates)
  const activities = sectionEl.querySelectorAll<HTMLElement>(
    '.activity.activity-wrapper[data-for="cmitem"]',
  );
  const items: ScrapedItem[] = [];

  activities.forEach((act) => {
    const item = parseActivity(act);
    if (item) items.push(item);
  });

  return items;
}

/**
 * Scrapes sections for "tiles" format courses.
 *
 * Tiles format:
 *  - Section 0 (top): #section-0, always visible
 *  - Sections 1+: displayed as li.tile[data-section][data-true-sectionid]
 *  - Tile content loaded into #section-{n} on click (lazy loaded)
 *
 * Since content is lazy-loaded, we use the section page URL instead:
 *   /course/section.php?id={trueSectionId}
 * This returns the section with all activities pre-rendered.
 *
 * For the content script approach, we read whatever is already loaded
 * in the DOM (section-0 + any expanded tile).
 */
function scrapeTilesFormat(): ScrapedSection[] {
  const sections: ScrapedSection[] = [];

  // Section 0 (top section, always visible)
  const section0 = document.querySelector<HTMLElement>('#section-0');
  if (section0) {
    const items = scrapeActivitiesFromSection(section0);
    if (items.length > 0) {
      sections.push({
        moodleSectionId: '0',
        title: 'General',
        position: 0,
        items,
      });
    }
  }

  // Tile sections
  const tiles = document.querySelectorAll<HTMLElement>(
    'li.tile[data-section]',
  );
  tiles.forEach((tile) => {
    const sectionNum = tile.dataset.section ?? '';
    const trueSectionId = tile.dataset.trueSectionid ?? sectionNum;
    const titleEl = tile.querySelector<HTMLElement>('.tile-name, h3');
    const title = titleEl?.textContent?.trim() ?? `Section ${sectionNum}`;
    const position = parseInt(sectionNum, 10);

    // Check if this tile's content is already loaded in the DOM
    const sectionEl = document.querySelector<HTMLElement>(
      `#section-${sectionNum}`,
    );
    const items = sectionEl ? scrapeActivitiesFromSection(sectionEl) : [];

    sections.push({
      moodleSectionId: trueSectionId,
      title,
      position,
      items,
    });
  });

  return sections;
}

/**
 * Scrapes sections for standard "topics" or "weeks" format courses.
 *
 * Standard format:
 *  - All sections rendered as li.section.course-section[data-sectionid]
 *  - Activities are always present in the DOM
 */
function scrapeStandardFormat(): ScrapedSection[] {
  const sections: ScrapedSection[] = [];
  const sectionEls = document.querySelectorAll<HTMLElement>(
    'li.section[data-sectionid], .section.course-section[data-section]',
  );

  sectionEls.forEach((sectionEl, idx) => {
    const sectionId =
      sectionEl.dataset.sectionid ??
      sectionEl.dataset.section ??
      String(idx);
    const titleEl = sectionEl.querySelector<HTMLElement>(
      '.sectionname, .section-title h3, .inplaceeditable',
    );
    const title = titleEl?.textContent?.trim() ?? `Section ${idx}`;
    const items = scrapeActivitiesFromSection(sectionEl);

    sections.push({
      moodleSectionId: sectionId,
      title,
      position: idx,
      items,
    });
  });

  return sections;
}

/**
 * Scrapes the full course content (sections + items) from a course page.
 * Handles both "tiles" and standard (topics/weeks) formats.
 */
export function scrapeCourseContent(): ScrapedCourseContentData {
  const format = getCourseFormat();

  let sections: ScrapedSection[];
  if (format === 'tiles') {
    sections = scrapeTilesFormat();
  } else {
    sections = scrapeStandardFormat();
  }

  return { sections };
}

/**
 * Scrapes a single section page (/course/section.php?id={sectionId}).
 * This is used for tiles format where content is lazy-loaded.
 * The extension navigates to the section page to get full content.
 *
 * On a section page, the target section is loaded into #section-{n}
 * with class "state-visible". Section-0 items are also present but
 * we skip those — only scrape the target section's activities.
 */
export function scrapeSectionPage(): ScrapedItem[] {
  // Find the visible loaded section (not section-0)
  // The target section has class "state-visible" or is the only non-zero section with activities
  const loadedSection = document.querySelector<HTMLElement>(
    'li.section.course-section.state-visible, li.section.moveablesection.state-visible',
  );
  if (loadedSection) {
    return scrapeActivitiesFromSection(loadedSection);
  }

  // Fallback: find sections with activities, skip section-0
  const allSections = document.querySelectorAll<HTMLElement>(
    'li.section.course-section, li.section.moveablesection',
  );
  for (const section of allSections) {
    const sectionNum = section.dataset.section ?? section.id.replace('section-', '');
    if (sectionNum === '0') continue;
    const activities = section.querySelectorAll(
      '.activity.activity-wrapper[data-for="cmitem"]',
    );
    if (activities.length > 0) {
      return scrapeActivitiesFromSection(section);
    }
  }

  // Final fallback: use the whole content area
  const contentArea = document.querySelector<HTMLElement>(
    '#region-main .course-content',
  );
  if (!contentArea) return [];
  return scrapeActivitiesFromSection(contentArea);
}

// ============================================
// Self-registration: attach functions to window
// so the service worker can invoke them via
// chrome.scripting.executeScript()
// ============================================

(window as unknown as Record<string, unknown>).__typenote_scraper = {
  scrapeLoginStatus,
  scrapeCourses,
  scrapeCourseContent,
  scrapeSectionPage,
};
