const { Pool } = require('pg');
require('dotenv').config();

// Map old mock league_id -> football-data.org competition code
const CODE_MAP = {
  'premier-league': 'PL',
  'la-liga': 'PD',
  'serie-a': 'SA',
  'bundesliga': 'BL1',
  'ligue-1': 'FL1',
};

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    for (const [leagueId, code] of Object.entries(CODE_MAP)) {
      const result = await pool.query(
        'UPDATE matches SET competition_code = $1 WHERE league_id = $2 AND competition_code != $1',
        [code, leagueId]
      );
      if (result.rowCount > 0) {
        console.log(`Updated ${result.rowCount} matches: league_id=${leagueId} -> code=${code}`);
      }
    }

    // Verify
    const v = await pool.query('SELECT id, league_id, competition_code, home_team_name, away_team_name FROM matches');
    console.log('\nAll matches:');
    for (const row of v.rows) {
      console.log(`  ${row.id} | league=${row.league_id} | code=${row.competition_code} | ${row.home_team_name} vs ${row.away_team_name}`);
    }
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

main();