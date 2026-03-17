import { describe, it, expect } from 'vitest';
import { sanitizeAuthError } from './auth-errors';

describe('sanitizeAuthError', () => {
  it('maps "Invalid login credentials" to user-friendly message', () => {
    const error = { message: 'Invalid login credentials' };
    expect(sanitizeAuthError(error)).toBe('Invalid email or password.');
  });

  it('maps "User already registered" to generic message (no email enumeration)', () => {
    const error = { message: 'User already registered' };
    expect(sanitizeAuthError(error)).toBe(
      'Unable to create account. Try logging in or resetting your password.',
    );
  });

  it('maps rate limit errors to friendly message', () => {
    const error = { message: 'For security purposes, you can only request this after 60 seconds' };
    expect(sanitizeAuthError(error)).toBe(
      'Too many attempts. Please try again later.',
    );
  });

  it('maps email rate limit errors to friendly message', () => {
    const error = { message: 'Email rate limit exceeded' };
    expect(sanitizeAuthError(error)).toBe(
      'Too many attempts. Please try again later.',
    );
  });

  it('maps unknown errors to generic fallback', () => {
    const error = { message: 'some_internal_supabase_error_xyz' };
    expect(sanitizeAuthError(error)).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('handles errors with empty message', () => {
    const error = { message: '' };
    expect(sanitizeAuthError(error)).toBe(
      'Something went wrong. Please try again.',
    );
  });

  it('maps "Auth session missing" to session expired message', () => {
    const error = { message: 'Auth session missing' };
    expect(sanitizeAuthError(error)).toBe(
      'Your session has expired. Please sign in again.',
    );
  });

  it('maps "New password should be different" to friendly message', () => {
    const error = { message: 'New password should be different from the old password.' };
    expect(sanitizeAuthError(error)).toBe(
      'New password should be different from the old password.',
    );
  });

  it('maps signup disabled error', () => {
    const error = { message: 'Signups not allowed for this instance' };
    expect(sanitizeAuthError(error)).toBe(
      'Signups are currently disabled. Please try again later.',
    );
  });
});
