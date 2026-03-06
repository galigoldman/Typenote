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
  recovery_token
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
  ''
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
