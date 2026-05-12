const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

const migrations = [
  // Migration 001: football-data.org schema additions
  `alter table leagues add column if not exists code text`,
  `alter table leagues add column if not exists area text`,
  `alter table leagues add column if not exists season_start_date date`,
  `alter table leagues add column if not exists season_end_date date`,
  `alter table teams add column if not exists short_name text`,
  `alter table teams add column if not exists crest text`,
  `alter table teams add column if not exists country text`,
  `create table if not exists standings (
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
  )`,
  `create index if not exists idx_standings_competition on standings(competition_code)`,
  `alter table match_predictions add column if not exists updated_at timestamptz default now()`,
  `create unique index if not exists idx_match_predictions_match_id on match_predictions(match_id)`,
  `alter table matches add column if not exists home_win_probability numeric(5,2) default 0`,
  `alter table matches add column if not exists draw_probability numeric(5,2) default 0`,
  `alter table matches add column if not exists away_win_probability numeric(5,2) default 0`,
  `alter table matches add column if not exists conclusion text`,
  `alter table matches add column if not exists competition_code text`,
  `create index if not exists idx_matches_competition_code on matches(competition_code)`,
  `update matches m set competition_code = l.code from leagues l where m.league_id = l.id and m.competition_code is null`,
];

async function run() {
  for (const sql of migrations) {
    try {
      await pool.query(sql);
      console.log('OK:', sql.substring(0, 60) + '...');
    } catch (err) {
      console.error('FAIL:', sql.substring(0, 60) + '...');
      console.error('  ', err.message);
    }
  }
  await pool.end();
  console.log('Migration completed.');
}

run();