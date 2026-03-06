import { render, screen } from '@testing-library/react';
import { EmptyState } from './empty-state';

describe('EmptyState', () => {
  it('renders title and description', () => {
    render(
      <EmptyState
        title="No documents"
        description="Create your first document to get started."
      />,
    );

    expect(screen.getByText('No documents')).toBeInTheDocument();
    expect(
      screen.getByText('Create your first document to get started.'),
    ).toBeInTheDocument();
  });

  it('renders action when provided', () => {
    render(
      <EmptyState
        title="No documents"
        description="Create your first document to get started."
        action={<button>Create document</button>}
      />,
    );

    expect(screen.getByText('Create document')).toBeInTheDocument();
  });

  it('does not render action div when action is not provided', () => {
    const { container } = render(
      <EmptyState
        title="No documents"
        description="Create your first document to get started."
      />,
    );

    const actionDiv = container.querySelector('.mt-4');
    expect(actionDiv).not.toBeInTheDocument();
  });
});
