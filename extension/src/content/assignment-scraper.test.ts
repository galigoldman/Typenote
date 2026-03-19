import { describe, it, expect, beforeEach } from 'vitest';
import { scrapeAssignmentPage } from './assignment-scraper';

describe('scrapeAssignmentPage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = '';
  });

  it('extracts title from h1 inside page-header-headings (real Moodle 4.x structure)', () => {
    document.body.innerHTML = `
      <div class="page-header-headings"><h1 class="h2">תרגיל 1</h1></div>
      <div class="activity-description" id="intro"><div class="box">content</div></div>
    `;
    const result = scrapeAssignmentPage();
    expect(result.title).toBe('תרגיל 1');
  });

  it('falls back to h2 if h1 not present', () => {
    document.body.innerHTML = `
      <div class="page-header-headings"><h2>Homework 3</h2></div>
    `;
    const result = scrapeAssignmentPage();
    expect(result.title).toBe('Homework 3');
  });

  it('extracts description from #intro', () => {
    document.body.innerHTML = `
      <div class="activity-description" id="intro">
        <div class="box"><p>Question 1: Solve x+2=5</p></div>
      </div>
    `;
    const result = scrapeAssignmentPage();
    expect(result.descriptionHtml).toContain('Solve x+2=5');
  });

  it('extracts due date from activity-dates region (Hebrew)', () => {
    document.body.innerHTML = `
      <div data-region="activity-dates">
        <div><strong>נפתח:</strong> יום שני, 27 אוקטובר 2025, 11:00 AM</div>
        <div><strong>מסתיים:</strong> יום שלישי, 4 נובמבר 2025, 11:30 AM</div>
      </div>
    `;
    const result = scrapeAssignmentPage();
    expect(result.dueDate).not.toBeNull();
  });

  it('extracts due date from activity-dates region (English)', () => {
    document.body.innerHTML = `
      <div data-region="activity-dates">
        <div><strong>Due:</strong> Tuesday, 4 November 2025, 11:30 AM</div>
      </div>
    `;
    const result = scrapeAssignmentPage();
    expect(result.dueDate).not.toBeNull();
  });

  it('extracts submission status from table with th labels (real structure)', () => {
    document.body.innerHTML = `
      <div class="submissionstatustable">
        <table class="generaltable">
          <tbody>
            <tr>
              <th class="cell c0" scope="row">מצב ההגשה</th>
              <td class="cell c1 lastcol">הוגש למתן ציון</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    const result = scrapeAssignmentPage();
    expect(result.submissionStatus).toBe('הוגש למתן ציון');
  });

  it('extracts submission status with English labels', () => {
    document.body.innerHTML = `
      <div class="submissionstatustable">
        <table class="generaltable">
          <tbody>
            <tr>
              <th class="cell c0" scope="row">Submission status</th>
              <td class="cell c1 lastcol">Submitted for grading</td>
            </tr>
          </tbody>
        </table>
      </div>
    `;
    const result = scrapeAssignmentPage();
    expect(result.submissionStatus).toBe('Submitted for grading');
  });

  it('extracts attached PDF file links from description', () => {
    document.body.innerHTML = `
      <div class="activity-description" id="intro">
        <div class="box">
          <a href="https://moodle.runi.ac.il/2026/pluginfile.php/121274/mod_assign/introattachment/0/תרגיל%201.pdf?forcedownload=1">תרגיל 1.pdf</a>
        </div>
      </div>
    `;
    const result = scrapeAssignmentPage();
    expect(result.attachedFiles).toHaveLength(1);
    expect(result.attachedFiles[0].name).toBe('תרגיל 1.pdf');
    expect(result.attachedFiles[0].url).toContain('pluginfile.php');
  });

  it('returns empty description when no description area found', () => {
    document.body.innerHTML = '<div></div>';
    const result = scrapeAssignmentPage();
    expect(result.descriptionHtml).toBe('');
    expect(result.attachedFiles).toHaveLength(0);
  });

  it('returns null due date when no date info found', () => {
    document.body.innerHTML = '<div></div>';
    const result = scrapeAssignmentPage();
    expect(result.dueDate).toBeNull();
  });

  it('returns null submission status when not present', () => {
    document.body.innerHTML = '<div></div>';
    const result = scrapeAssignmentPage();
    expect(result.submissionStatus).toBeNull();
  });

  it('falls back to document title when no header element', () => {
    document.body.innerHTML = '<div></div>';
    document.title = 'Assignment 5 | My Course';
    const result = scrapeAssignmentPage();
    expect(result.title).toBe('Assignment 5');
  });

  it('extracts module ID from URL params', () => {
    // jsdom doesn't easily set window.location.search, so test the fallback
    const result = scrapeAssignmentPage();
    expect(result.moodleModuleId).toBe('');
  });
});
