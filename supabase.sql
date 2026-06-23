-- ============================================================================
--  XSS 体験デモ用 Supabase スキーマ
-- ============================================================================
--  Supabase ダッシュボードの「SQL Editor」にこの内容を貼り付けて実行してください。
--  （研修用の使い捨てプロジェクトを前提にしています）
-- ============================================================================

-- チャット投稿
create table if not exists public.messages (
  id          bigint generated always as identity primary key,
  name        text,
  body        text,
  created_at  timestamptz not null default now()
);

-- 攻撃で盗まれた Cookie 文字列
create table if not exists public.stolen (
  id          bigint generated always as identity primary key,
  data        text,
  created_at  timestamptz not null default now()
);

-- このアプリはサーバー側で service_role キーを使ってアクセスするため、
-- RLS（行レベルセキュリティ）は不要です。明示的に無効化しておきます。
alter table public.messages disable row level security;
alter table public.stolen   disable row level security;
