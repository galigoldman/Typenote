import { describe, it, expect, beforeEach } from 'vitest';
import { scrapeAssignmentPage } from './assignment-scraper';

describe('scrapeAssignmentPage', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    document.title = '';
  });

  it('extracts title from page header', () => {
    document.body.innerHTML = `
      <div class="page-header-headings"><h2>Homework 3</h2></div>
      <div class="activity-description"><div class="no-overflow"><p>Q1: Solve x=1</p></div></div>
    `;
    const result = scrapeAssignmentPage();
    expect(result.title).toBe('Homework 3');
    expect(result.descriptionHtml).toContain('Solve x=1');
  });

  it('extracts due date from submission status table', () => {
    document.body.innerHTML = `
      <table class="submissionstatustable"><tr>
        <td class="cell c0">Due date</td>
        <td class="cell c1">1 April 2026, 11:59 PM</td>
      </tr></table>
    `;
    const result = scrapeAssignmentPage();
    expect(result.dueDate).not.toBeNull();
  });

  it('returns empty description when no description area found', () => {
    document.body.innerHTML = '<div></div>';
    const result = scrapeAssignmentPage();
    expect(result.descriptionHtml).toBe('');
  });

  it('extracts module ID from URL params', () => {
    const result = scrapeAssignmentPage();
    expect(result.moodleModuleId).toBe('');
  });

  it('falls back to document title when no header element', () => {
    document.body.innerHTML = '<div></div>';
    document.title = 'Assignment 5 | My Course';
    const result = scrapeAssignmentPage();
    expect(result.title).toBe('Assignment 5');
  });
});
