/**
 * Sanitizes Supabase Auth error messages to prevent email enumeration
 * and provide user-friendly feedback.
 *
 * OWASP guideline: Auth error messages must not reveal whether a specific
 * email address is registered in the system. Generic messages prevent
 * attackers from enumerating valid accounts.
 */

const ERROR_MAP: Record<string, string> = {
  'Invalid login credentials': 'Invalid email or password.',
  'User already registered':
    'Unable to create account. Try logging in or resetting your password.',
  'Auth session missing': 'Your session has expired. Please sign in again.',
  'Signups not allowed for this instance':
    'Signups are currently disabled. Please try again later.',
  'New password should be different from the old password.':
    'New password should be different from the old password.',
};

const RATE_LIMIT_PATTERNS = [
  'rate limit',
  'too many requests',
  'after 60 seconds',
  'after 30 seconds',
];

const FALLBACK_MESSAGE = 'Something went wrong. Please try again.';

export function sanitizeAuthError(error: { message: string }): string {
  const msg = error.message;

  if (!msg) return FALLBACK_MESSAGE;

  // Check exact matches first
  if (ERROR_MAP[msg]) return ERROR_MAP[msg];

  // Check rate limit patterns (case-insensitive substring match)
  const lowerMsg = msg.toLowerCase();
  if (RATE_LIMIT_PATTERNS.some((pattern) => lowerMsg.includes(pattern))) {
    return 'Too many attempts. Please try again later.';
  }

  // Fallback: never expose raw Supabase error messages
  return FALLBACK_MESSAGE;
}
