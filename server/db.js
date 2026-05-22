require('dotenv').config();
const { Pool } = require('pg');

const dbConfig = (() => {
  if (process.env.DATABASE_URL) {
    return {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
    };
  }
  const host = process.env.DB_HOST || process.env.PGHOST || 'localhost';
  const port = parseInt(process.env.DB_PORT || process.env.PGPORT || '5432');
  const database = process.env.DB_NAME || process.env.PGDATABASE || 'codementor_db';
  const user = process.env.DB_USER || process.env.PGUSER || 'postgres';
  const password = process.env.DB_PASSWORD || process.env.PGPASSWORD || 'postgres';
  const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');
  return {
    host,
    port,
    database,
    user,
    password,
    ssl: isLocalhost ? false : { rejectUnauthorized: false }
  };
})();

const pool = new Pool(dbConfig);

// Create tables if they don't exist
async function initDB() {
  console.log(`Connecting to database at: ${dbConfig.connectionString ? 'External DATABASE_URL' : dbConfig.host}`);
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS students (
        id           SERIAL PRIMARY KEY,
        name         VARCHAR(100) NOT NULL,
        email        VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        avatar_color VARCHAR(20) DEFAULT '#00f5d4',
        created_at   TIMESTAMP DEFAULT NOW()
      );
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS progress (
        id           SERIAL PRIMARY KEY,
        student_id   INTEGER REFERENCES students(id) ON DELETE CASCADE,
        language     VARCHAR(50)  NOT NULL,
        topic_id     VARCHAR(100) NOT NULL,
        completed    BOOLEAN DEFAULT false,
        score        INTEGER DEFAULT 0,
        updated_at   TIMESTAMP DEFAULT NOW(),
        UNIQUE(student_id, language, topic_id)
      );
    `);

    console.log('✅ Database tables ready');
  } catch (err) {
    console.error('❌ DB init error:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { pool, initDB };
