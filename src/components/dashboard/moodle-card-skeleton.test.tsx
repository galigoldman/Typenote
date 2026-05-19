import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { MoodleCardSkeleton } from './moodle-card-skeleton';

describe('MoodleCardSkeleton', () => {
  it('renders a non-empty placeholder element', () => {
    const { container } = render(<MoodleCardSkeleton />);
    expect(container.firstChild).not.toBeNull();
    expect(container.textContent).toBe('');
  });
});
