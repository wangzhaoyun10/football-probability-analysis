-- Migration: Add football-data.org sync support
-- Adds new columns to leagues and teams, creates standings table

-- Add new columns to leagues
alter table leagues
  add column if not exists code text,
  add column if not exists area text,
  add column if not exists season_start_date date,
  add column if not exists season_end_date date;

-- Add new columns to teams
alter table teams
  add column if not exists short_name text,
  add column if not exists crest text,
  add column if not exists country text;

-- Create standings table
create table if not exists standings (
  id bigint generated always as identity primary key,
  competition_code text not null,
  team_id text not null references teams(id),
  position int not null,
  played_games int default 0,
  wins int default 0,
  draws int default 0,
  losses int default 0,
  goals_for int default 0,
  goals_against int default 0,
  goal_difference int default 0,
  points int default 0,
  form text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Create index for standings lookup
create index if not exists idx_standings_competition on standings(competition_code);

-- Add updated_at column to match_predictions (if not exists)
alter table match_predictions
  add column if not exists updated_at timestamptz default now();

-- Ensure unique constraint on match_predictions.match_id for upsert
create unique index if not exists idx_match_predictions_match_id
  on match_predictions(match_id);

-- Add competition_code column to matches table for efficient filtering
alter table matches
  add column if not exists competition_code text;

-- Create index for competition_code filtering
create index if not exists idx_matches_competition_code on matches(competition_code);

-- Backfill competition_code from leagues.code where possible
update matches m
set competition_code = l.code
from leagues l
where m.league_id = l.id
  and m.competition_code is null;
