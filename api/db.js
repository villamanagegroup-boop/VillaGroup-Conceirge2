const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

async function setupDatabase() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contact_submissions (
      id          SERIAL PRIMARY KEY,
      name        VARCHAR(255)  NOT NULL,
      email       VARCHAR(255)  NOT NULL,
      phone       VARCHAR(50),
      company     VARCHAR(255),
      role        VARCHAR(100),
      message     TEXT          NOT NULL,
      referral    VARCHAR(100),
      ip_address  VARCHAR(45),
      created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
    )
  `);
}

module.exports = { pool, setupDatabase };
