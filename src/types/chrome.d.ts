/**
 * Minimal Chrome extension API type declarations.
 * Only the subset used by use-moodle-extension.ts for external messaging.
 */
declare namespace chrome {
  namespace runtime {
    const lastError: { message: string } | null | undefined;
    function sendMessage(
      extensionId: string,
      message: unknown,
      callback: (response: unknown) => void,
    ): void;
  }
}
