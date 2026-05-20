require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool(
  process.env.DATABASE_URL
    ? { 
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
      }
    : {
        host:     process.env.DB_HOST     || 'localhost',
        port:     parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME     || 'codementor_db',
        user:     process.env.DB_USER     || 'postgres',
        password: process.env.DB_PASSWORD || 'postgres',
      }
);

// Create tables if they don't exist
async function initDB() {
  console.log(`Connecting to database at: ${process.env.DATABASE_URL ? 'External URL (DATABASE_URL)' : (process.env.DB_HOST || 'localhost')}`);
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
