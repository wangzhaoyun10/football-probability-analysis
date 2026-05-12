const { Pool } = require('pg');
require('dotenv').config();

async function main() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
  });

  try {
    const r = await pool.query(`
      SELECT m.id, l.id AS league_id, l.code AS league_code
      FROM matches m
      JOIN leagues l ON m.league_id = l.id
      WHERE m.competition_code IS NULL
    `);
    console.log('Rows to backfill:', r.rows.length);

    if (r.rows.length > 0) {
      for (const row of r.rows) {
        const code = row.league_code || row.league_id;
        await pool.query('UPDATE matches SET competition_code = $1 WHERE id = $2', [code, row.id]);
        console.log('Updated:', row.id, '->', code);
      }
    } else {
      console.log('No rows to backfill.');
    }
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
}

main();