import { describe, it, expectTypeOf } from 'vitest';
import type {
  Profile,
  Folder,
  Document,
  Subject,
  CanvasType,
} from './database';

describe('Database types', () => {
  it('Profile has correct shape', () => {
    expectTypeOf<Profile>().toHaveProperty('id');
    expectTypeOf<Profile>().toHaveProperty('email');
    expectTypeOf<Profile>().toHaveProperty('display_name');
    expectTypeOf<Profile>().toHaveProperty('avatar_url');
    expectTypeOf<Profile>().toHaveProperty('created_at');
    expectTypeOf<Profile>().toHaveProperty('updated_at');
  });

  it('Folder has correct shape', () => {
    expectTypeOf<Folder>().toHaveProperty('id');
    expectTypeOf<Folder>().toHaveProperty('user_id');
    expectTypeOf<Folder>().toHaveProperty('parent_id');
    expectTypeOf<Folder>().toHaveProperty('name');
    expectTypeOf<Folder>().toHaveProperty('color');
    expectTypeOf<Folder>().toHaveProperty('position');
  });

  it('Document has correct shape', () => {
    expectTypeOf<Document>().toHaveProperty('id');
    expectTypeOf<Document>().toHaveProperty('user_id');
    expectTypeOf<Document>().toHaveProperty('folder_id');
    expectTypeOf<Document>().toHaveProperty('title');
    expectTypeOf<Document>().toHaveProperty('content');
    expectTypeOf<Document>().toHaveProperty('subject');
    expectTypeOf<Document>().toHaveProperty('canvas_type');
  });

  it('Subject is a union of valid subjects', () => {
    expectTypeOf<'calculus'>().toMatchTypeOf<Subject>();
    expectTypeOf<'linear_algebra'>().toMatchTypeOf<Subject>();
    expectTypeOf<'other'>().toMatchTypeOf<Subject>();
    // @ts-expect-error - invalid subject
    expectTypeOf<'invalid_subject'>().toMatchTypeOf<Subject>();
  });

  it('CanvasType is a union of valid types', () => {
    expectTypeOf<'blank'>().toMatchTypeOf<CanvasType>();
    expectTypeOf<'lined'>().toMatchTypeOf<CanvasType>();
    expectTypeOf<'grid'>().toMatchTypeOf<CanvasType>();
    // @ts-expect-error - invalid canvas type
    expectTypeOf<'dots'>().toMatchTypeOf<CanvasType>();
  });
});
