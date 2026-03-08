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
  phone,
  phone_change,
  phone_change_token,
  reauthentication_token,
  is_sso_user,
  is_anonymous
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
  '',
  '',
  '',
  '',
  false,
  false
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

INSERT INTO public.folders (id, user_id, parent_id, name, color, position)
VALUES ('10000000-0000-0000-0000-000000000001', 'ac3be77d-4566-406c-9ac0-7c410634ad41', NULL, 'Calculus I', '#EF4444', 0)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.folders (id, user_id, parent_id, name, color, position)
VALUES ('10000000-0000-0000-0000-000000000002', 'ac3be77d-4566-406c-9ac0-7c410634ad41', NULL, 'Calculus II', '#F97316', 1)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.folders (id, user_id, parent_id, name, color, position)
VALUES ('10000000-0000-0000-0000-000000000003', 'ac3be77d-4566-406c-9ac0-7c410634ad41', NULL, 'Linear Algebra', '#8B5CF6', 2)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.folders (id, user_id, parent_id, name, color, position)
VALUES ('10000000-0000-0000-0000-000000000004', 'ac3be77d-4566-406c-9ac0-7c410634ad41', NULL, 'Data Structures', '#3B82F6', 3)
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.folders (id, user_id, parent_id, name, color, position)
VALUES ('10000000-0000-0000-0000-000000000005', 'ac3be77d-4566-406c-9ac0-7c410634ad41', NULL, 'Physics', '#22C55E', 4)
ON CONFLICT (id) DO NOTHING;

-- ============================================
-- DOCUMENTS (all canvas hybrid format)
-- ============================================

-- Helper: canvas document wraps TipTap content inside an element

-- Calculus I: Limits and Continuity (lined background)
INSERT INTO public.documents (id, user_id, folder_id, title, content, subject, canvas_type, position)
VALUES (
  '20000000-0000-0000-0000-000000000001',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '10000000-0000-0000-0000-000000000001',
  'Limits and Continuity',
  '{"format":"canvas","version":1,"viewport":{"x":0,"y":0,"zoom":1},"background":"lined","elements":{"e1":{"type":"text-block","x":100,"y":80,"width":700,"height":500,"zOrder":0,"content":{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"textAlign":null},"content":[{"type":"text","text":"Limits and Continuity"}]},{"type":"paragraph","content":[{"type":"text","text":"A limit describes the value a function approaches as the input approaches a given point."}]},{"type":"heading","attrs":{"level":2,"textAlign":null},"content":[{"type":"text","text":"Key Definitions"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Limit:"},{"type":"text","text":" lim x→a f(x) = L means f(x) gets arbitrarily close to L as x approaches a."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Continuity:"},{"type":"text","text":" f is continuous at a if lim x→a f(x) = f(a)."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Squeeze Theorem:"},{"type":"text","text":" If g(x) ≤ f(x) ≤ h(x) and lim g(x) = lim h(x) = L, then lim f(x) = L."}]}]}]}]}}},"zOrder":["e1"]}',
  'calculus',
  'lined',
  0
) ON CONFLICT (id) DO NOTHING;

-- Calculus I: Derivatives (lined background)
INSERT INTO public.documents (id, user_id, folder_id, title, content, subject, canvas_type, position)
VALUES (
  '20000000-0000-0000-0000-000000000002',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '10000000-0000-0000-0000-000000000001',
  'Derivatives',
  '{"format":"canvas","version":1,"viewport":{"x":0,"y":0,"zoom":1},"background":"lined","elements":{"e1":{"type":"text-block","x":100,"y":80,"width":700,"height":500,"zOrder":0,"content":{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"textAlign":null},"content":[{"type":"text","text":"Derivatives"}]},{"type":"paragraph","content":[{"type":"text","text":"The derivative measures the instantaneous rate of change of a function."}]},{"type":"heading","attrs":{"level":2,"textAlign":null},"content":[{"type":"text","text":"Derivative Rules"}]},{"type":"orderedList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Power Rule:"},{"type":"text","text":" d/dx [x^n] = nx^(n-1)"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Product Rule:"},{"type":"text","text":" d/dx [f·g] = f′g + fg′"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Chain Rule:"},{"type":"text","text":" d/dx [f(g(x))] = f′(g(x)) · g′(x)"}]}]}]}]}}},"zOrder":["e1"]}',
  'calculus',
  'lined',
  1
) ON CONFLICT (id) DO NOTHING;

-- Calculus I: Integration Techniques (grid background)
INSERT INTO public.documents (id, user_id, folder_id, title, content, subject, canvas_type, position)
VALUES (
  '20000000-0000-0000-0000-000000000003',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '10000000-0000-0000-0000-000000000001',
  'Integration Techniques',
  '{"format":"canvas","version":1,"viewport":{"x":0,"y":0,"zoom":1},"background":"grid","elements":{"e1":{"type":"text-block","x":100,"y":80,"width":700,"height":500,"zOrder":0,"content":{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"textAlign":null},"content":[{"type":"text","text":"Integration Techniques"}]},{"type":"paragraph","content":[{"type":"text","text":"Integration is the reverse process of differentiation."}]},{"type":"heading","attrs":{"level":2,"textAlign":null},"content":[{"type":"text","text":"Methods"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Substitution:"},{"type":"text","text":" Replace a composite expression with a single variable u."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Integration by Parts:"},{"type":"text","text":" ∫ u dv = uv - ∫ v du"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Partial Fractions:"},{"type":"text","text":" Decompose rational functions into simpler fractions."}]}]}]}]}}},"zOrder":["e1"]}',
  'calculus',
  'grid',
  2
) ON CONFLICT (id) DO NOTHING;

-- Calculus II: Sequences and Series (blank background)
INSERT INTO public.documents (id, user_id, folder_id, title, content, subject, canvas_type, position)
VALUES (
  '20000000-0000-0000-0000-000000000004',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '10000000-0000-0000-0000-000000000002',
  'Sequences and Series',
  '{"format":"canvas","version":1,"viewport":{"x":0,"y":0,"zoom":1},"background":"blank","elements":{"e1":{"type":"text-block","x":100,"y":80,"width":700,"height":500,"zOrder":0,"content":{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"textAlign":null},"content":[{"type":"text","text":"Sequences and Series"}]},{"type":"paragraph","content":[{"type":"text","text":"A sequence is an ordered list of numbers. A series is the sum of a sequence."}]},{"type":"heading","attrs":{"level":2,"textAlign":null},"content":[{"type":"text","text":"Convergence Tests"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Ratio Test:"},{"type":"text","text":" If lim |a(n+1)/a(n)| < 1, the series converges absolutely."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Integral Test:"},{"type":"text","text":" If f is positive and decreasing, Σf(n) converges iff ∫f(x)dx converges."}]}]}]}]}}},"zOrder":["e1"]}',
  'calculus',
  'blank',
  0
) ON CONFLICT (id) DO NOTHING;

-- Calculus II: Taylor and Maclaurin Series (dotted background)
INSERT INTO public.documents (id, user_id, folder_id, title, content, subject, canvas_type, position)
VALUES (
  '20000000-0000-0000-0000-000000000005',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '10000000-0000-0000-0000-000000000002',
  'Taylor and Maclaurin Series',
  '{"format":"canvas","version":1,"viewport":{"x":0,"y":0,"zoom":1},"background":"dotted","elements":{"e1":{"type":"text-block","x":100,"y":80,"width":700,"height":500,"zOrder":0,"content":{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"textAlign":null},"content":[{"type":"text","text":"Taylor and Maclaurin Series"}]},{"type":"paragraph","content":[{"type":"text","text":"A Taylor series represents a function as an infinite sum of terms calculated from the values of its derivatives at a single point."}]},{"type":"heading","attrs":{"level":2,"textAlign":null},"content":[{"type":"text","text":"Common Expansions"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"e^x = 1 + x + x²/2! + x³/3! + ..."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"sin(x) = x - x³/3! + x⁵/5! - ..."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"cos(x) = 1 - x²/2! + x⁴/4! - ..."}]}]}]}]}}},"zOrder":["e1"]}',
  'calculus',
  'dotted',
  1
) ON CONFLICT (id) DO NOTHING;

-- Linear Algebra: Vectors and Matrices (grid background)
INSERT INTO public.documents (id, user_id, folder_id, title, content, subject, canvas_type, position)
VALUES (
  '20000000-0000-0000-0000-000000000006',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '10000000-0000-0000-0000-000000000003',
  'Vectors and Matrices',
  '{"format":"canvas","version":1,"viewport":{"x":0,"y":0,"zoom":1},"background":"grid","elements":{"e1":{"type":"text-block","x":100,"y":80,"width":700,"height":500,"zOrder":0,"content":{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"textAlign":null},"content":[{"type":"text","text":"Vectors and Matrices"}]},{"type":"paragraph","content":[{"type":"text","text":"Vectors represent magnitude and direction. Matrices are rectangular arrays of numbers used to represent linear transformations."}]},{"type":"heading","attrs":{"level":2,"textAlign":null},"content":[{"type":"text","text":"Key Operations"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Dot Product:"},{"type":"text","text":" a · b = |a||b|cos(θ) — measures how aligned two vectors are."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Cross Product:"},{"type":"text","text":" a × b produces a vector perpendicular to both a and b."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Matrix Multiplication:"},{"type":"text","text":" (AB)ᵢⱼ = Σ Aᵢₖ Bₖⱼ — rows of A times columns of B."}]}]}]}]}}},"zOrder":["e1"]}',
  'linear_algebra',
  'grid',
  0
) ON CONFLICT (id) DO NOTHING;

-- Linear Algebra: Eigenvalues (grid background)
INSERT INTO public.documents (id, user_id, folder_id, title, content, subject, canvas_type, position)
VALUES (
  '20000000-0000-0000-0000-000000000007',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '10000000-0000-0000-0000-000000000003',
  'Eigenvalues and Eigenvectors',
  '{"format":"canvas","version":1,"viewport":{"x":0,"y":0,"zoom":1},"background":"grid","elements":{"e1":{"type":"text-block","x":100,"y":80,"width":700,"height":500,"zOrder":0,"content":{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"textAlign":null},"content":[{"type":"text","text":"Eigenvalues and Eigenvectors"}]},{"type":"paragraph","content":[{"type":"text","text":"An eigenvector of a matrix A is a non-zero vector v such that Av = λv, where λ is the eigenvalue."}]},{"type":"heading","attrs":{"level":2,"textAlign":null},"content":[{"type":"text","text":"How to Find Eigenvalues"}]},{"type":"orderedList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"Solve det(A - λI) = 0 (the characteristic equation)"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"For each eigenvalue λ, solve (A - λI)v = 0 to find eigenvectors"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","text":"The set of all eigenvectors for a given λ forms the eigenspace"}]}]}]}]}}},"zOrder":["e1"]}',
  'linear_algebra',
  'grid',
  1
) ON CONFLICT (id) DO NOTHING;

-- Data Structures: Binary Trees (blank background)
INSERT INTO public.documents (id, user_id, folder_id, title, content, subject, canvas_type, position)
VALUES (
  '20000000-0000-0000-0000-000000000008',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '10000000-0000-0000-0000-000000000004',
  'Binary Trees',
  '{"format":"canvas","version":1,"viewport":{"x":0,"y":0,"zoom":1},"background":"blank","elements":{"e1":{"type":"text-block","x":100,"y":80,"width":700,"height":500,"zOrder":0,"content":{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"textAlign":null},"content":[{"type":"text","text":"Binary Trees"}]},{"type":"paragraph","content":[{"type":"text","text":"A binary tree is a tree data structure where each node has at most two children: left and right."}]},{"type":"heading","attrs":{"level":2,"textAlign":null},"content":[{"type":"text","text":"Traversals"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"In-order:"},{"type":"text","text":" Left → Root → Right (gives sorted order for BST)"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Pre-order:"},{"type":"text","text":" Root → Left → Right (useful for tree copy)"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Post-order:"},{"type":"text","text":" Left → Right → Root (useful for tree deletion)"}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Level-order:"},{"type":"text","text":" BFS using a queue, level by level"}]}]}]}]}}},"zOrder":["e1"]}',
  'data_structures',
  'blank',
  0
) ON CONFLICT (id) DO NOTHING;

-- Data Structures: Hash Tables (blank background)
INSERT INTO public.documents (id, user_id, folder_id, title, content, subject, canvas_type, position)
VALUES (
  '20000000-0000-0000-0000-000000000009',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '10000000-0000-0000-0000-000000000004',
  'Hash Tables',
  '{"format":"canvas","version":1,"viewport":{"x":0,"y":0,"zoom":1},"background":"blank","elements":{"e1":{"type":"text-block","x":100,"y":80,"width":700,"height":500,"zOrder":0,"content":{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"textAlign":null},"content":[{"type":"text","text":"Hash Tables"}]},{"type":"paragraph","content":[{"type":"text","text":"A hash table maps keys to values using a hash function for O(1) average-case lookup."}]},{"type":"heading","attrs":{"level":2,"textAlign":null},"content":[{"type":"text","text":"Collision Resolution"}]},{"type":"bulletList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Chaining:"},{"type":"text","text":" Each bucket stores a linked list of entries that hash to the same index."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Open Addressing:"},{"type":"text","text":" Probe for the next available slot (linear, quadratic, or double hashing)."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Load Factor:"},{"type":"text","text":" n/m ratio — resize when it exceeds threshold (typically 0.75)."}]}]}]}]}}},"zOrder":["e1"]}',
  'data_structures',
  'blank',
  1
) ON CONFLICT (id) DO NOTHING;

-- Physics: Newton's Laws (lined background)
INSERT INTO public.documents (id, user_id, folder_id, title, content, subject, canvas_type, position)
VALUES (
  '20000000-0000-0000-0000-000000000010',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  '10000000-0000-0000-0000-000000000005',
  'Newton''s Laws of Motion',
  '{"format":"canvas","version":1,"viewport":{"x":0,"y":0,"zoom":1},"background":"lined","elements":{"e1":{"type":"text-block","x":100,"y":80,"width":700,"height":500,"zOrder":0,"content":{"type":"doc","content":[{"type":"heading","attrs":{"level":1,"textAlign":null},"content":[{"type":"text","text":"Newton''s Laws of Motion"}]},{"type":"paragraph","content":[{"type":"text","text":"The three laws that form the foundation of classical mechanics."}]},{"type":"heading","attrs":{"level":2,"textAlign":null},"content":[{"type":"text","text":"The Three Laws"}]},{"type":"orderedList","content":[{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"First Law (Inertia):"},{"type":"text","text":" An object at rest stays at rest, and an object in motion stays in motion, unless acted upon by an external force."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Second Law:"},{"type":"text","text":" F = ma — Force equals mass times acceleration."}]}]},{"type":"listItem","content":[{"type":"paragraph","content":[{"type":"text","marks":[{"type":"bold"}],"text":"Third Law:"},{"type":"text","text":" For every action, there is an equal and opposite reaction."}]}]}]}]}}},"zOrder":["e1"]}',
  'physics',
  'lined',
  0
) ON CONFLICT (id) DO NOTHING;

-- Loose document (no folder) — Quick Notes
INSERT INTO public.documents (id, user_id, folder_id, title, content, subject, canvas_type, position)
VALUES (
  '20000000-0000-0000-0000-000000000011',
  'ac3be77d-4566-406c-9ac0-7c410634ad41',
  NULL,
  'Quick Notes',
  '{"format":"canvas","version":1,"viewport":{"x":0,"y":0,"zoom":1},"background":"blank","elements":{"e1":{"type":"text-block","x":100,"y":80,"width":700,"height":300,"zOrder":0,"content":{"type":"doc","content":[{"type":"paragraph","content":[{"type":"text","text":"Scratch pad for random ideas and quick notes."}]}]}}},"zOrder":["e1"]}',
  'other',
  'blank',
  0
) ON CONFLICT (id) DO NOTHING;
