-- 足球赛事胜平负概率分析系统 - 数据库表结构
-- PostgreSQL

-- ============================================================
-- 联赛表
-- ============================================================
create table if not exists leagues (
  id text primary key,
  name text not null,
  country text not null,
  coverage_score int default 0,
  matches_count int default 0,
  created_at timestamptz default now()
);

-- ============================================================
-- 球队表
-- ============================================================
create table if not exists teams (
  id text primary key,
  name text not null,
  league_id text references leagues(id),
  created_at timestamptz default now()
);

-- ============================================================
-- 比赛表
-- ============================================================
create table if not exists matches (
  id text primary key,
  league_id text not null references leagues(id),
  home_team_id text not null references teams(id),
  away_team_id text not null references teams(id),
  match_time timestamptz not null,
  venue text,
  status text default '未开始',
  home_score int,
  away_score int,
  created_at timestamptz default now()
);

-- ============================================================
-- 比赛预测数据表
-- ============================================================
create table if not exists match_predictions (
  id bigint generated always as identity primary key,
  match_id text not null references matches(id),
  home_win_probability numeric(5,2) not null,
  draw_probability numeric(5,2) not null,
  away_win_probability numeric(5,2) not null,
  conclusion text,
  model_version text default 'static',
  created_at timestamptz default now()
);

-- ============================================================
-- 比赛球队统计数据表
-- ============================================================
create table if not exists match_team_stats (
  id bigint generated always as identity primary key,
  match_id text not null references matches(id),
  team_id text not null references teams(id),
  side text not null check (side in ('home', 'away')),
  recent_form text[] default '{}',
  attack_score int default 0,
  defense_score int default 0,
  possession int default 0,
  shots int default 0,
  created_at timestamptz default now()
);

-- ============================================================
-- 历史交锋记录表
-- ============================================================
create table if not exists head_to_head (
  id bigint generated always as identity primary key,
  match_id text not null references matches(id),
  score_text text not null,
  created_at timestamptz default now()
);

-- ============================================================
-- 预测信号表
-- ============================================================
create table if not exists prediction_signals (
  id bigint generated always as identity primary key,
  match_id text not null references matches(id),
  label text not null,
  value text not null,
  sort_order int default 0,
  created_at timestamptz default now()
);

-- ============================================================
-- 数据同步日志表
-- ============================================================
create table if not exists sync_logs (
  id bigint generated always as identity primary key,
  sync_type text not null,
  source text not null,
  status text not null check (status in ('running', 'success', 'failed')),
  message text,
  total_count int default 0,
  success_count int default 0,
  failed_count int default 0,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz default now()
);