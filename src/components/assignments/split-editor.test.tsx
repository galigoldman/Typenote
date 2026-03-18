import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SplitEditor } from './split-editor';

const defaultProps = {
  descriptionHtml: '<p>Question 1: Solve x=1</p><p>Question 2: Prove y=2</p>',
  initialBoundaries: [
    { label: '1', position: 0, boundaryStart: 0, boundaryEnd: 28 },
    { label: '2', position: 1, boundaryStart: 28, boundaryEnd: 56 },
  ],
  onSave: vi.fn(),
  onCancel: vi.fn(),
};

describe('SplitEditor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 1. Renders assignment content with boundary markers
  // -------------------------------------------------------------------------
  it('renders assignment content with boundary markers', () => {
    render(<SplitEditor {...defaultProps} />);

    // Should show labels for each boundary
    expect(screen.getByText('Question 1')).toBeInTheDocument();
    expect(screen.getByText('Question 2')).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // 2. Calls onSave with isPersonal: false when "Save as shared" clicked
  // -------------------------------------------------------------------------
  it('calls onSave with isPersonal: false when "Save as shared" clicked', () => {
    const onSave = vi.fn();

    render(<SplitEditor {...defaultProps} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /save as shared/i }));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ isPersonal: false }),
    );
  });

  // -------------------------------------------------------------------------
  // 3. Calls onSave with isPersonal: true when "Save as personal" clicked
  // -------------------------------------------------------------------------
  it('calls onSave with isPersonal: true when "Save as personal" clicked', () => {
    const onSave = vi.fn();

    render(<SplitEditor {...defaultProps} onSave={onSave} />);

    fireEvent.click(screen.getByRole('button', { name: /save as personal/i }));

    expect(onSave).toHaveBeenCalledOnce();
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({ isPersonal: true }),
    );
  });

  // -------------------------------------------------------------------------
  // 4. Calls onCancel when Cancel clicked
  // -------------------------------------------------------------------------
  it('calls onCancel when Cancel clicked', () => {
    const onCancel = vi.fn();

    render(<SplitEditor {...defaultProps} onCancel={onCancel} />);

    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));

    expect(onCancel).toHaveBeenCalledOnce();
  });
});
