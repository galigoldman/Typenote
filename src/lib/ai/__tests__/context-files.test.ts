import { describe, expect, it, vi } from 'vitest';
import {
  resolveContextFileName,
  resolveContextFileMeta,
} from '@/lib/ai/context-files';

function clientReturning(row: Record<string, unknown> | null) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          maybeSingle: vi.fn().mockResolvedValue({ data: row }),
        }),
      }),
    }),
  } as never;
}

describe('resolveContextFileName', () => {
  it('reads course material file_name via the user client', async () => {
    const name = await resolveContextFileName(
      clientReturning({ file_name: 'lecture.pdf' }),
      clientReturning(null),
      'course_material',
      'id-1',
    );
    expect(name).toBe('lecture.pdf');
  });

  it('reads personal file display_name', async () => {
    const name = await resolveContextFileName(
      clientReturning({ display_name: 'My Notes' }),
      clientReturning(null),
      'personal_file',
      'id-2',
    );
    expect(name).toBe('My Notes');
  });

  it('reads moodle file_name via the admin client', async () => {
    const name = await resolveContextFileName(
      clientReturning(null),
      clientReturning({ file_name: 'hw3.pdf' }),
      'moodle_file',
      'id-3',
    );
    expect(name).toBe('hw3.pdf');
  });

  it('returns null on missing row', async () => {
    const name = await resolveContextFileName(
      clientReturning(null),
      clientReturning(null),
      'course_material',
      'missing',
    );
    expect(name).toBeNull();
  });
});

describe('resolveContextFileMeta', () => {
  it('strips the moodle: prefix and switches bucket for course materials', async () => {
    const meta = await resolveContextFileMeta(
      clientReturning({
        file_name: 'hw.pdf',
        storage_path: 'moodle:abc/def.pdf',
        mime_type: 'application/pdf',
      }),
      clientReturning(null),
      'course_material',
      'id-1',
    );
    expect(meta).toEqual({
      name: 'hw.pdf',
      mimeType: 'application/pdf',
      bucket: 'moodle-materials',
      storagePath: 'abc/def.pdf',
    });
  });

  it('keeps the course-materials bucket for a normal course material', async () => {
    const meta = await resolveContextFileMeta(
      clientReturning({
        file_name: 'notes.pdf',
        storage_path: 'u/notes.pdf',
        mime_type: 'application/pdf',
      }),
      clientReturning(null),
      'course_material',
      'id-2',
    );
    expect(meta).toEqual({
      name: 'notes.pdf',
      mimeType: 'application/pdf',
      bucket: 'course-materials',
      storagePath: 'u/notes.pdf',
    });
  });

  it('returns null when the row is missing', async () => {
    const meta = await resolveContextFileMeta(
      clientReturning(null),
      clientReturning(null),
      'personal_file',
      'missing',
    );
    expect(meta).toBeNull();
  });
});
