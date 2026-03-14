-- ============================================
-- Enable pgvector extension for vector
-- similarity search (embedding storage + HNSW).
-- ============================================

create extension if not exists vector with schema extensions;
