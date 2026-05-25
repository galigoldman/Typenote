-- Seed test user for local development
-- Email: test@typenote.dev | Password: Test1234

-- Insert into auth.users (Supabase auth table)
INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  email_change_token_current,
  email_change_confirm_status
) VALUES (
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'test@typenote.dev',
  crypt('Test1234', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"email":"test@typenote.dev","email_verified":true,"full_name":"Test User"}',
  now(),
  now(),
  '',
  '',
  '',
  '',
  '',
  0
) ON CONFLICT (id) DO NOTHING;

-- Insert identity for the user
INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '{"sub":"ac3be77d-4566-406c-9ac0-7c410634ad41","email":"test@typenote.dev","email_verified":true}',
  'email',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  now(),
  now(),
  now()
) ON CONFLICT (provider_id, provider) DO NOTHING;

-- The profile will be auto-created by the handle_new_user() trigger.
-- Set the test user's subscription tier (default is 'free', explicit for clarity).
UPDATE public.profiles SET subscription_tier = 'free' WHERE id = 'ac3be77d-4566-406c-9ac0-7c410634ad41';

-- ============================================
-- SECOND TEST USER (for RLS isolation tests)
-- Email: test-b@typenote.dev | Password: Test1234
-- ============================================

INSERT INTO auth.users (
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  recovery_token,
  email_change,
  email_change_token_new,
  email_change_token_current,
  email_change_confirm_status
) VALUES (
  'bd4ce88e-5677-507d-ad1d-8d4275a45b52',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'test-b@typenote.dev',
  crypt('Test1234', gen_salt('bf')),
  now(),
  '{"provider":"email","providers":["email"]}',
  '{"email":"test-b@typenote.dev","email_verified":true,"full_name":"Test User B"}',
  now(),
  now(),
  '',
  '',
  '',
  '',
  '',
  0
) ON CONFLICT (id) DO NOTHING;

INSERT INTO auth.identities (
  id,
  user_id,
  identity_data,
  provider,
  provider_id,
  last_sign_in_at,
  created_at,
  updated_at
) VALUES (
  'bd4ce88e-5677-507d-ad1d-8d4275a45b52',
  'bd4ce88e-5677-507d-ad1d-8d4275a45b52',
  '{"sub":"bd4ce88e-5677-507d-ad1d-8d4275a45b52","email":"test-b@typenote.dev","email_verified":true}',
  'email',
  'bd4ce88e-5677-507d-ad1d-8d4275a45b52',
  now(),
  now(),
  now()
) ON CONFLICT (provider_id, provider) DO NOTHING;

UPDATE public.profiles SET subscription_tier = 'free' WHERE id = 'bd4ce88e-5677-507d-ad1d-8d4275a45b52';

-- Sample AI usage data for testing the quota display
INSERT INTO public.ai_usage (user_id, usage_month, query_type, query_count, last_model)
VALUES ('ac3be77d-4566-406c-9ac0-7c410634ad41', to_char(CURRENT_DATE, 'YYYY-MM'), 'chat', 3, 'flash')
ON CONFLICT (user_id, usage_month, query_type) DO NOTHING;

-- ============================================
-- FOLDERS (Notebooks)
-- ============================================

-- Calculus I
INSERT INTO public.folders (id, user_id, parent_id, name, color, position)
VALUES ('10000000-0000-0000-0000-000000000001', 'ac3be77d-4566-406c-9ac0-7c410634ad41', NULL, 'Calculus I', '#EF4444', 0)
ON CONFLICT (id) DO NOTHING;

-- Calculus II
INSERT INTO public.folders (id, user_id, parent_id, name, color, position)
VALUES ('10000000-0000-0000-0000-000000000002', 'ac3be77d-4566-406c-9ac0-7c410634ad41', NULL, 'Calculus II', '#F97316', 1)
ON CONFLICT (id) DO NOTHING;

-- Linear Algebra
INSERT INTO public.folders (id, user_id, parent_id, name, color, position)
VALUES ('10000000-0000-0000-0000-000000000003', 'ac3be77d-4566-406c-9ac0-7c410634ad41', NULL, 'Linear Algebra', '#8B5CF6', 2)
ON CONFLICT (id) DO NOTHING;

-- Data Structures
INSERT INTO public.folders (id, user_id, parent_id, name, color, position)
VALUES ('10000000-0000-0000-0000-000000000004', 'ac3be77d-4566-406c-9ac0-7c410634ad41', NULL, 'Data Structures', '#3B82F6', 3)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DOCUMENTS
-- ============================================

-- Calculus I documents
INSERT INTO public.documents (id, user_id, folder_id, title, content, subject, canvas_type, position)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '10000000-0000-0000-0000-000000000001',
  'Limits and Continuity',
  '{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"textAlign":null},"content":[{"type":"text","text":"Limits and Continuity"}]},{"type":"paragraph","content":[{"type":"text","text":"A limit describes the value a function approaches as the input approaches a given point."}]},{"type":"heading","attrs":{"level":2,"textAlign":null},"content":[{"type":"text","text":"Key Definitions"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Limit:"},{"type":"text","text":" lim x\u2192a f(x) = L means f(x) gets arbitrarily close to L as x approaches a."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Continuity:"},{"type":"text","text":" f is continuous at a if lim x\u2192a f(x) = f(a)."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Squeeze Theorem:"},{"type":"text","text":" If g(x) \u2264 f(x) \u2264 h(x) and lim g(x) = lim h(x) = L, then lim f(x) = L."}]}]}]}]}',
  'calculus',
  'lined',
  0
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.documents (id, user_id, folder_id, title, content, subject, canvas_type, position)
VALUES (
  '20000000-0000-0000-0000-000000000002',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '10000000-0000-0000-0000-000000000001',
  'Derivatives',
  '{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"textAlign":null},"content":[{"type":"text","text":"Derivatives"}]},{"type":"paragraph","content":[{"type":"text","text":"The derivative measures the instantaneous rate of change of a function."}]},{"type":"heading","attrs":{"level":2,"textAlign":null},"content":[{"type":"text","text":"Derivative Rules"}]},{"type":"orderedList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Power Rule:"},{"type":"text","text":" d/dx [x^n] = nx^(n-1)"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Product Rule:"},{"type":"text","text":" d/dx [f\u00b7g] = f\u2032g + fg\u2032"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Chain Rule:"},{"type":"text","text":" d/dx [f(g(x))] = f\u2032(g(x)) \u00b7 g\u2032(x)"}]}]}]}]}',
  'calculus',
  'lined',
  1
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.documents (id, user_id, folder_id, title, content, subject, canvas_type, position)
VALUES (
  '20000000-0000-0000-0000-000000000003',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '10000000-0000-0000-0000-000000000001',
  'Integration Techniques',
  '{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"textAlign":null},"content":[{"type":"text","text":"Integration Techniques"}]},{"type":"paragraph","content":[{"type":"text","text":"Integration is the reverse process of differentiation. Here are the main techniques:"}]},{"type":"heading","attrs":{"level":2,"textAlign":null},"content":[{"type":"text","text":"Methods"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Substitution:"},{"type":"text","text":" Replace a composite expression with a single variable u."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Integration by Parts:"},{"type":"text","text":" \u222b u dv = uv - \u222b v du"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Partial Fractions:"},{"type":"text","text":" Decompose rational functions into simpler fractions."}]}]}]}]}',
  'calculus',
  'lined',
  2
) ON CONFLICT (id) DO NOTHING;

-- Calculus II documents
INSERT INTO public.documents (id, user_id, folder_id, title, content, subject, canvas_type, position)
VALUES (
  '20000000-0000-0000-0000-000000000004',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '10000000-0000-0000-0000-000000000002',
  'Sequences and Series',
  '{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"textAlign":null},"content":[{"type":"text","text":"Sequences and Series"}]},{"type":"paragraph","content":[{"type":"text","text":"A sequence is an ordered list of numbers. A series is the sum of a sequence."}]},{"type":"heading","attrs":{"level":2,"textAlign":null},"content":[{"type":"text","text":"Convergence Tests"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Ratio Test:"},{"type":"text","text":" If lim |a(n+1)/a(n)| < 1, the series converges absolutely."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Integral Test:"},{"type":"text","text":" If f is positive and decreasing, \u2211f(n) converges iff \u222bf(x)dx converges."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Comparison Test:"},{"type":"text","text":" Compare with a known convergent or divergent series."}]}]}]}]}',
  'calculus',
  'blank',
  0
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.documents (id, user_id, folder_id, title, content, subject, canvas_type, position)
VALUES (
  '20000000-0000-0000-0000-000000000005',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '10000000-0000-0000-0000-000000000002',
  'Taylor and Maclaurin Series',
  '{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"textAlign":null},"content":[{"type":"text","text":"Taylor and Maclaurin Series"}]},{"type":"paragraph","content":[{"type":"text","text":"A Taylor series represents a function as an infinite sum of terms calculated from the values of its derivatives at a single point."}]},{"type":"heading","attrs":{"level":2,"textAlign":null},"content":[{"type":"text","text":"Common Expansions"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"e^x = 1 + x + x\u00b2/2! + x\u00b3/3! + ..."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"sin(x) = x - x\u00b3/3! + x\u2075/5! - ..."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"cos(x) = 1 - x\u00b2/2! + x\u2074/4! - ..."}]}]}]}]}',
  'calculus',
  'blank',
  1
) ON CONFLICT (id) DO NOTHING;

-- Loose document (no folder)
INSERT INTO public.documents (id, user_id, folder_id, title, content, subject, canvas_type, position)
VALUES (
  '20000000-0000-0000-0000-000000000006',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  NULL,
  'Quick Notes',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Scratch pad for random ideas and quick notes."}]}]}',
  'other',
  'blank',
  0
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- COURSES
-- ============================================

-- Calculus I (as a course)
INSERT INTO public.courses (id, user_id, folder_id, name, code, semester, color, position)
VALUES ('30000000-0000-0000-0000-000000000001', 'ac3be77d-4566-406c-9ac0-7c410634ad41', NULL, 'Introduction to CS', 'CS101', 'Spring 2026', '#10B981', 0)
ON CONFLICT (id) DO NOTHING;

-- Linear Algebra (inside a folder)
INSERT INTO public.courses (id, user_id, folder_id, name, code, semester, color, position)
VALUES ('30000000-0000-0000-0000-000000000002', 'ac3be77d-4566-406c-9ac0-7c410634ad41', '10000000-0000-0000-0000-000000000003', 'Linear Algebra', 'MATH202', 'Spring 2026', '#8B5CF6', 0)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- COURSE MATERIALS (no actual files, just DB references for testing)
-- ============================================

INSERT INTO public.course_materials (id, course_id, user_id, category, storage_path, file_name, label, file_size, mime_type)
VALUES ('50000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'ac3be77d-4566-406c-9ac0-7c410634ad41', 'material', 'ac3be77d-4566-406c-9ac0-7c410634ad41/30000000-0000-0000-0000-000000000001/lecture-1-slides.pdf', 'lecture-1-slides.pdf', 'Lecture 1: Intro to Programming', 2048000, 'application/pdf')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.course_materials (id, course_id, user_id, category, storage_path, file_name, label, file_size, mime_type)
VALUES ('50000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'ac3be77d-4566-406c-9ac0-7c410634ad41', 'homework', 'ac3be77d-4566-406c-9ac0-7c410634ad41/30000000-0000-0000-0000-000000000001/homework-1.pdf', 'homework-1.pdf', 'Problem Set 1', 512000, 'application/pdf')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.course_materials (id, course_id, user_id, category, storage_path, file_name, label, file_size, mime_type)
VALUES ('50000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000001', 'ac3be77d-4566-406c-9ac0-7c410634ad41', 'material', 'ac3be77d-4566-406c-9ac0-7c410634ad41/30000000-0000-0000-0000-000000000001/lecture-2-slides.pdf', 'lecture-2-slides.pdf', 'Lecture 2: If/Else and Loops', 3072000, 'application/pdf')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- MOODLE SHARED REGISTRY (test data)
-- ============================================

-- Test Moodle instance
INSERT INTO public.moodle_instances (id, domain, name)
VALUES ('60000000-0000-0000-0000-000000000001', 'moodle.test.ac.il', 'Test University Moodle')
ON CONFLICT (id) DO NOTHING;

-- Test Moodle courses
INSERT INTO public.moodle_courses (id, instance_id, moodle_course_id, name, moodle_url)
VALUES ('61000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001', '101', 'Introduction to Computer Science', 'https://moodle.test.ac.il/course/view.php?id=101')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.moodle_courses (id, instance_id, moodle_course_id, name, moodle_url)
VALUES ('61000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000001', '202', 'Data Structures and Algorithms', 'https://moodle.test.ac.il/course/view.php?id=202')
ON CONFLICT (id) DO NOTHING;

-- Test Moodle sections for CS101
INSERT INTO public.moodle_sections (id, course_id, moodle_section_id, title, position)
VALUES ('62000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000001', 'sec-0', 'General', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.moodle_sections (id, course_id, moodle_section_id, title, position)
VALUES ('62000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000001', 'sec-1', 'Week 1: Introduction to Programming', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.moodle_sections (id, course_id, moodle_section_id, title, position)
VALUES ('62000000-0000-0000-0000-000000000003', '61000000-0000-0000-0000-000000000001', 'sec-2', 'Week 2: Variables and Data Types', 2)
ON CONFLICT (id) DO NOTHING;

-- Test Moodle files
INSERT INTO public.moodle_files (id, section_id, type, moodle_url, file_name, content_hash, storage_path, file_size, mime_type, position)
VALUES ('63000000-0000-0000-0000-000000000001', '62000000-0000-0000-0000-000000000001', 'file', 'https://moodle.test.ac.il/pluginfile.php/101/syllabus.pdf', 'syllabus.pdf', 'abc123hash', 'moodle.test.ac.il/101/abc123hash_syllabus.pdf', 1048576, 'application/pdf', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.moodle_files (id, section_id, type, moodle_url, file_name, content_hash, storage_path, file_size, mime_type, position)
VALUES ('63000000-0000-0000-0000-000000000002', '62000000-0000-0000-0000-000000000002', 'file', 'https://moodle.test.ac.il/pluginfile.php/101/lecture1.pdf', 'lecture1.pdf', 'def456hash', 'moodle.test.ac.il/101/def456hash_lecture1.pdf', 2097152, 'application/pdf', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.moodle_files (id, section_id, type, moodle_url, file_name, external_url, position)
VALUES ('63000000-0000-0000-0000-000000000003', '62000000-0000-0000-0000-000000000002', 'link', 'https://moodle.test.ac.il/mod/url/view.php?id=501', 'Python Tutorial Video', 'https://youtube.com/watch?v=example', 1)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- MOODLE USER SYNC DATA (test user)
-- ============================================

-- User's Moodle connection
INSERT INTO public.user_moodle_connections (id, user_id, instance_id)
VALUES ('64000000-0000-0000-0000-000000000001', 'ac3be77d-4566-406c-9ac0-7c410634ad41', '60000000-0000-0000-0000-000000000001')
ON CONFLICT (id) DO NOTHING;

-- User's course sync
INSERT INTO public.user_course_syncs (id, user_id, moodle_course_id, course_id, last_synced_at)
VALUES ('65000000-0000-0000-0000-000000000001', 'ac3be77d-4566-406c-9ac0-7c410634ad41', '61000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', now())
ON CONFLICT (id) DO NOTHING;

-- User's file imports
INSERT INTO public.user_file_imports (id, user_id, moodle_file_id, sync_id, status)
VALUES ('66000000-0000-0000-0000-000000000001', 'ac3be77d-4566-406c-9ac0-7c410634ad41', '63000000-0000-0000-0000-000000000001', '65000000-0000-0000-0000-000000000001', 'imported')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.user_file_imports (id, user_id, moodle_file_id, sync_id, status)
VALUES ('66000000-0000-0000-0000-000000000002', 'ac3be77d-4566-406c-9ac0-7c410634ad41', '63000000-0000-0000-0000-000000000002', '65000000-0000-0000-0000-000000000001', 'imported')
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- PERSONAL FILES (test data for personal file import)
-- ============================================

INSERT INTO public.personal_files (id, user_id, course_id, category, file_name, display_name, mime_type, file_size, storage_path)
VALUES (
  '80000000-0000-0000-0000-000000000001',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '30000000-0000-0000-0000-000000000001',
  'material',
  'my-notes.pdf',
  'my-notes',
  'application/pdf',
  1024000,
  'ac3be77d-4566-406c-9ac0-7c410634ad41/30000000-0000-0000-0000-000000000001/my-notes.pdf'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.personal_files (id, user_id, course_id, category, file_name, display_name, mime_type, file_size, storage_path)
VALUES (
  '80000000-0000-0000-0000-000000000002',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '30000000-0000-0000-0000-000000000001',
  'homework',
  'essay-draft.docx',
  'essay-draft',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  512000,
  'ac3be77d-4566-406c-9ac0-7c410634ad41/30000000-0000-0000-0000-000000000001/essay-draft.docx'
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- AI CONVERSATIONS (test data for conversation persistence)
-- ============================================

-- Conversation 1: CS101 — about variables
INSERT INTO public.ai_conversations (id, user_id, course_id, title, created_at, updated_at)
VALUES (
  '70000000-0000-0000-0000-000000000001',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '30000000-0000-0000-0000-000000000001',
  'What are variables and how do they',
  '2026-03-10 10:00:00+00',
  '2026-03-10 10:05:00+00'
) ON CONFLICT (id) DO NOTHING;

-- Conversation 2: CS101 — about control flow
INSERT INTO public.ai_conversations (id, user_id, course_id, title, created_at, updated_at)
VALUES (
  '70000000-0000-0000-0000-000000000002',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '30000000-0000-0000-0000-000000000001',
  'Explain the difference between for and',
  '2026-03-12 14:00:00+00',
  '2026-03-12 14:10:00+00'
) ON CONFLICT (id) DO NOTHING;

-- Conversation 3: Linear Algebra — about vectors
INSERT INTO public.ai_conversations (id, user_id, course_id, title, created_at, updated_at)
VALUES (
  '70000000-0000-0000-0000-000000000003',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '30000000-0000-0000-0000-000000000002',
  'How do I calculate the dot product of',
  '2026-03-15 09:00:00+00',
  '2026-03-15 09:08:00+00'
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- AI MESSAGES (test data)
-- ============================================

-- Conversation 1 messages (CS101 — variables)
INSERT INTO public.ai_messages (id, conversation_id, role, content, sources_json, model, created_at)
VALUES (
  '71000000-0000-0000-0000-000000000001',
  '70000000-0000-0000-0000-000000000001',
  'user',
  'What are variables and how do they work in programming?',
  NULL,
  NULL,
  '2026-03-10 10:00:00+00'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ai_messages (id, conversation_id, role, content, sources_json, model, created_at)
VALUES (
  '71000000-0000-0000-0000-000000000002',
  '70000000-0000-0000-0000-000000000001',
  'assistant',
  'A variable is a named container that stores a value in your program''s memory. Think of it like a labeled box — you give it a name and put data inside.\n\nIn most languages, you declare a variable and assign it a value:\n```python\nage = 25\nname = "Alice"\n```\n\nThe key concepts are:\n1. **Declaration** — telling the program a variable exists\n2. **Assignment** — putting a value into the variable\n3. **Type** — what kind of data the variable holds (number, string, etc.)',
  '[{"sourceType":"course_material","sourceName":"lecture-1-slides.pdf","pageRange":"5-8"}]',
  'flash',
  '2026-03-10 10:00:05+00'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ai_messages (id, conversation_id, role, content, sources_json, model, created_at)
VALUES (
  '71000000-0000-0000-0000-000000000003',
  '70000000-0000-0000-0000-000000000001',
  'user',
  'Can a variable change its type in Python?',
  NULL,
  NULL,
  '2026-03-10 10:03:00+00'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ai_messages (id, conversation_id, role, content, sources_json, model, created_at)
VALUES (
  '71000000-0000-0000-0000-000000000004',
  '70000000-0000-0000-0000-000000000001',
  'assistant',
  'Yes! Python is **dynamically typed**, which means a variable can hold different types at different times:\n\n```python\nx = 42        # x is an integer\nx = "hello"   # now x is a string\n```\n\nThis is different from **statically typed** languages like Java or C++, where the type is fixed at declaration.',
  NULL,
  'flash',
  '2026-03-10 10:05:00+00'
) ON CONFLICT (id) DO NOTHING;

-- Conversation 2 messages (CS101 — control flow)
INSERT INTO public.ai_messages (id, conversation_id, role, content, sources_json, model, created_at)
VALUES (
  '71000000-0000-0000-0000-000000000005',
  '70000000-0000-0000-0000-000000000002',
  'user',
  'Explain the difference between for and while loops',
  NULL,
  NULL,
  '2026-03-12 14:00:00+00'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ai_messages (id, conversation_id, role, content, sources_json, model, created_at)
VALUES (
  '71000000-0000-0000-0000-000000000006',
  '70000000-0000-0000-0000-000000000002',
  'assistant',
  'Great question! Both are loops, but they serve different purposes:\n\n**For loop** — use when you know how many times to iterate:\n```python\nfor i in range(5):\n    print(i)  # prints 0, 1, 2, 3, 4\n```\n\n**While loop** — use when the number of iterations depends on a condition:\n```python\ncount = 0\nwhile count < 5:\n    print(count)\n    count += 1\n```\n\nThe key difference: `for` iterates over a sequence, `while` continues until a condition is false.',
  '[{"sourceType":"course_material","sourceName":"lecture-2-slides.pdf","pageRange":"12-15"}]',
  'flash',
  '2026-03-12 14:00:08+00'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ai_messages (id, conversation_id, role, content, sources_json, model, created_at)
VALUES (
  '71000000-0000-0000-0000-000000000007',
  '70000000-0000-0000-0000-000000000002',
  'user',
  'When would I use a while True loop?',
  NULL,
  NULL,
  '2026-03-12 14:05:00+00'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ai_messages (id, conversation_id, role, content, sources_json, model, created_at)
VALUES (
  '71000000-0000-0000-0000-000000000008',
  '70000000-0000-0000-0000-000000000002',
  'assistant',
  'A `while True` loop runs forever until you explicitly `break` out of it. Common use cases:\n\n1. **Menu systems** — keep showing options until user quits\n2. **Game loops** — run until game over\n3. **Server listeners** — wait for incoming connections\n\n```python\nwhile True:\n    choice = input("Enter command (q to quit): ")\n    if choice == "q":\n        break\n    process(choice)\n```\n\nBe careful — forgetting the `break` condition creates an infinite loop!',
  NULL,
  'flash',
  '2026-03-12 14:10:00+00'
) ON CONFLICT (id) DO NOTHING;

-- Conversation 3 messages (Linear Algebra — dot product)
INSERT INTO public.ai_messages (id, conversation_id, role, content, sources_json, model, created_at)
VALUES (
  '71000000-0000-0000-0000-000000000009',
  '70000000-0000-0000-0000-000000000003',
  'user',
  'How do I calculate the dot product of two vectors?',
  NULL,
  NULL,
  '2026-03-15 09:00:00+00'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ai_messages (id, conversation_id, role, content, sources_json, model, created_at)
VALUES (
  '71000000-0000-0000-0000-000000000010',
  '70000000-0000-0000-0000-000000000003',
  'assistant',
  'The **dot product** (also called scalar product) of two vectors is calculated by multiplying corresponding components and summing the results.\n\nFor vectors **a** = (a₁, a₂, ..., aₙ) and **b** = (b₁, b₂, ..., bₙ):\n\n**a · b** = a₁b₁ + a₂b₂ + ... + aₙbₙ\n\nExample:\n- **a** = (2, 3)\n- **b** = (4, -1)\n- **a · b** = (2)(4) + (3)(-1) = 8 - 3 = **5**\n\nThe dot product tells you how much two vectors point in the same direction. If the result is 0, the vectors are perpendicular (orthogonal).',
  NULL,
  'pro',
  '2026-03-15 09:00:10+00'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ai_messages (id, conversation_id, role, content, sources_json, model, created_at)
VALUES (
  '71000000-0000-0000-0000-000000000011',
  '70000000-0000-0000-0000-000000000003',
  'user',
  'What is the geometric interpretation?',
  NULL,
  NULL,
  '2026-03-15 09:05:00+00'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.ai_messages (id, conversation_id, role, content, sources_json, model, created_at)
VALUES (
  '71000000-0000-0000-0000-000000000012',
  '70000000-0000-0000-0000-000000000003',
  'assistant',
  'Geometrically, the dot product relates to the angle θ between two vectors:\n\n**a · b** = |a| × |b| × cos(θ)\n\nThis gives us powerful insights:\n- **Positive** dot product → vectors point in similar directions (θ < 90°)\n- **Zero** dot product → vectors are perpendicular (θ = 90°)\n- **Negative** dot product → vectors point in opposite directions (θ > 90°)\n\nYou can also find the angle between two vectors:\n\ncos(θ) = (a · b) / (|a| × |b|)',
  NULL,
  'pro',
  '2026-03-15 09:08:00+00'
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- COURSE DOCUMENTS (for homework session testing)
-- ============================================

-- Exercise document in CS101 (the homework questions)
INSERT INTO public.documents (id, user_id, course_id, purpose, title, content, subject, canvas_type, position)
VALUES (
  '20000000-0000-0000-0000-000000000010',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '30000000-0000-0000-0000-000000000001',
  'homework',
  'Problem Set 1: Variables',
  '{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"textAlign":null},"content":[{"type":"text","text":"Problem Set 1: Variables and Data Types"}]},{"type":"heading","attrs":{"level":2,"textAlign":null},"content":[{"type":"text","text":"Question 1"}]},{"type":"paragraph","content":[{"type":"text","text":"Explain the difference between mutable and immutable data types in Python. Give two examples of each."}]},{"type":"heading","attrs":{"level":2,"textAlign":null},"content":[{"type":"text","text":"Question 2"}]},{"type":"paragraph","content":[{"type":"text","text":"What is the output of the following code? Explain why."}]},{"type":"codeBlock","content":[{"type":"text","text":"x = [1, 2, 3]\\ny = x\\ny.append(4)\\nprint(x)"}]},{"type":"heading","attrs":{"level":2,"textAlign":null},"content":[{"type":"text","text":"Question 3"}]},{"type":"paragraph","content":[{"type":"text","text":"Write a function that takes a list of integers and returns a dictionary mapping each integer to its square."}]}]}',
  'data_structures',
  'blank',
  0
) ON CONFLICT (id) DO NOTHING;

-- Homework document (the student's work on the exercise)
INSERT INTO public.documents (id, user_id, course_id, purpose, title, content, subject, canvas_type, position)
VALUES (
  '20000000-0000-0000-0000-000000000011',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '30000000-0000-0000-0000-000000000001',
  'homework',
  'HW — Problem Set 1: Variables',
  '{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"My solutions for Problem Set 1..."}]}]}',
  'data_structures',
  'blank',
  1
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- HOMEWORK SESSIONS (test data)
-- ============================================

INSERT INTO public.homework_sessions (id, document_id, exercise_document_id, course_id, user_id)
VALUES (
  'a0000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000011',
  '20000000-0000-0000-0000-000000000010',
  '30000000-0000-0000-0000-000000000001',
  'ac3be77d-4566-406c-9ac0-7c410634ad41'
) ON CONFLICT (id) DO NOTHING;

INSERT INTO public.homework_session_materials (id, session_id, material_type, material_id)
VALUES (
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'course_material',
  '50000000-0000-0000-0000-000000000001'
) ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DOCUMENT VERSIONS (test data for version history)
-- ============================================

-- Version 1 for "Limits and Continuity" — idle snapshot (older content)
INSERT INTO public.document_versions (id, document_id, user_id, content, pages, title, trigger, created_at)
VALUES (
  '90000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"textAlign":null},"content":[{"type":"text","text":"Limits and Continuity"}]},{"type":"paragraph","content":[{"type":"text","text":"Draft: A limit describes the value a function approaches."}]}]}',
  NULL,
  'Limits and Continuity',
  'idle',
  '2026-04-10 14:00:00+00'
) ON CONFLICT (id) DO NOTHING;

-- Version 2 for "Limits and Continuity" — periodic snapshot
INSERT INTO public.document_versions (id, document_id, user_id, content, pages, title, trigger, created_at)
VALUES (
  '90000000-0000-0000-0000-000000000002',
  '20000000-0000-0000-0000-000000000001',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"textAlign":null},"content":[{"type":"text","text":"Limits and Continuity"}]},{"type":"paragraph","content":[{"type":"text","text":"A limit describes the value a function approaches as the input approaches a given point."}]},{"type":"heading","attrs":{"level":2,"textAlign":null},"content":[{"type":"text","text":"Key Definitions"}]}]}',
  NULL,
  'Limits and Continuity',
  'periodic',
  '2026-04-10 14:05:00+00'
) ON CONFLICT (id) DO NOTHING;

-- Version 3 for "Limits and Continuity" — close snapshot (latest)
INSERT INTO public.document_versions (id, document_id, user_id, content, pages, title, trigger, created_at)
VALUES (
  '90000000-0000-0000-0000-000000000003',
  '20000000-0000-0000-0000-000000000001',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"textAlign":null},"content":[{"type":"text","text":"Limits and Continuity"}]},{"type":"paragraph","content":[{"type":"text","text":"A limit describes the value a function approaches as the input approaches a given point."}]},{"type":"heading","attrs":{"level":2,"textAlign":null},"content":[{"type":"text","text":"Key Definitions"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Limit: lim x→a f(x) = L"}]}]}]}]}',
  NULL,
  'Limits and Continuity',
  'close',
  '2026-04-10 14:30:00+00'
) ON CONFLICT (id) DO NOTHING;
