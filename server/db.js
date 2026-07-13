require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

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
  const password = process.env.DB_PASSWORD || process.env.PGPASSWORD || 'botsio212nyc';
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

const pgPool = new Pool(dbConfig);
let useLocal = false;

// Local JSON Database Engine
const LOCAL_DB_PATH = path.join(__dirname, 'local_db.json');
let localDbData = {
  students: [],
  progress: [],
  badges: [],
  nextStudentId: 1,
  nextProgressId: 1,
  nextBadgeId: 1
};

function loadLocalDB() {
  try {
    if (fs.existsSync(LOCAL_DB_PATH)) {
      const raw = fs.readFileSync(LOCAL_DB_PATH, 'utf8');
      const parsed = JSON.parse(raw);
      localDbData = Object.assign(localDbData, parsed);
    }
  } catch (err) {
    console.error('Error loading local DB:', err.message);
  }
}

function saveLocalDB() {
  try {
    fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(localDbData, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving local DB:', err.message);
  }
}

async function localQuery(sql, params = []) {
  const upper = sql.toUpperCase();

  // Create / Alter Table queries
  if (upper.includes('CREATE TABLE') || upper.includes('ALTER TABLE')) {
    return { rows: [] };
  }

  // SELECT from students WHERE email
  if (upper.includes('FROM STUDENTS WHERE EMAIL')) {
    const email = String(params[0] || '').toLowerCase();
    const found = localDbData.students.filter(s => s.email.toLowerCase() === email);
    return { rows: found };
  }

  // SELECT from students WHERE id
  if (upper.includes('FROM STUDENTS WHERE ID')) {
    const id = Number(params[0]);
    const found = localDbData.students.filter(s => Number(s.id) === id);
    return { rows: found };
  }

  // INSERT INTO students
  if (upper.includes('INSERT INTO STUDENTS')) {
    const newStudent = {
      id: localDbData.nextStudentId++,
      name: params[0],
      email: params[1],
      password_hash: params[2],
      avatar_color: params[3],
      created_at: new Date().toISOString()
    };
    localDbData.students.push(newStudent);
    saveLocalDB();
    return { rows: [newStudent] };
  }

  // SELECT from progress WHERE student_id
  if (upper.includes('FROM PROGRESS WHERE STUDENT_ID')) {
    const studentId = Number(params[0]);
    const found = localDbData.progress.filter(p => Number(p.student_id) === studentId);
    return { rows: found };
  }

  // INSERT INTO progress (upsert)
  if (upper.includes('INSERT INTO PROGRESS')) {
    const studentId = Number(params[0]);
    const language = params[1];
    const topicId = params[2];
    const completed = !!params[3];
    const score = Number(params[4] || 0);
    const codeSnippet = params[5] || null;

    let existing = localDbData.progress.find(
      p => Number(p.student_id) === studentId && p.language === language && p.topic_id === topicId
    );

    if (existing) {
      existing.completed = existing.completed || completed;
      existing.score = Math.max(existing.score || 0, score);
      existing.code_snippet = codeSnippet !== null ? codeSnippet : existing.code_snippet;
      existing.updated_at = new Date().toISOString();
    } else {
      localDbData.progress.push({
        id: localDbData.nextProgressId++,
        student_id: studentId,
        language,
        topic_id: topicId,
        completed,
        score,
        code_snippet: codeSnippet,
        updated_at: new Date().toISOString()
      });
    }
    saveLocalDB();
    return { rows: [] };
  }

  // SELECT from badges WHERE student_id
  if (upper.includes('FROM BADGES WHERE STUDENT_ID')) {
    const studentId = Number(params[0]);
    const found = localDbData.badges.filter(b => Number(b.student_id) === studentId);
    return { rows: found };
  }

  // INSERT INTO badges
  if (upper.includes('INSERT INTO BADGES')) {
    const studentId = Number(params[0]);
    const badgeId = params[1];

    const exists = localDbData.badges.some(
      b => Number(b.student_id) === studentId && b.badge_id === badgeId
    );

    if (!exists) {
      localDbData.badges.push({
        id: localDbData.nextBadgeId++,
        student_id: studentId,
        badge_id: badgeId,
        earned_at: new Date().toISOString()
      });
      saveLocalDB();
    }
    return { rows: [] };
  }

  return { rows: [] };
}

const pool = {
  query: async (sql, params) => {
    if (useLocal) {
      return localQuery(sql, params);
    }
    return pgPool.query(sql, params);
  },
  connect: async () => {
    if (useLocal) {
      return {
        query: async (sql, params) => localQuery(sql, params),
        release: () => {}
      };
    }
    return pgPool.connect();
  }
};

async function initDB() {
  console.log(`Checking PostgreSQL database connection (${dbConfig.user}@${dbConfig.host}:${dbConfig.port}/${dbConfig.database})...`);
  try {
    let client;
    try {
      client = await pgPool.connect();
    } catch (err) {
      if (err.code === '3D000' || (err.message && err.message.includes('does not exist'))) {
        console.log(`Database "${dbConfig.database}" does not exist yet. Creating it automatically...`);
        const tempPool = new Pool({ ...dbConfig, database: 'postgres' });
        const tempClient = await tempPool.connect();
        try {
          await tempClient.query(`CREATE DATABASE "${dbConfig.database}"`);
          console.log(`✅ Database "${dbConfig.database}" created successfully.`);
        } finally {
          tempClient.release();
          await tempPool.end();
        }
        client = await pgPool.connect();
      } else {
        throw err;
      }
    }

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
          code_snippet TEXT,
          updated_at   TIMESTAMP DEFAULT NOW(),
          UNIQUE(student_id, language, topic_id)
        );
      `);

      await client.query(`
        CREATE TABLE IF NOT EXISTS badges (
          id           SERIAL PRIMARY KEY,
          student_id   INTEGER REFERENCES students(id) ON DELETE CASCADE,
          badge_id     VARCHAR(100) NOT NULL,
          earned_at    TIMESTAMP DEFAULT NOW(),
          UNIQUE(student_id, badge_id)
        );
      `);

      try {
        await client.query('ALTER TABLE progress ADD COLUMN code_snippet TEXT;');
      } catch (e) {}

      console.log('✅ Connected to PostgreSQL! Database tables ready.');
      useLocal = false;
    } finally {
      client.release();
    }
  } catch (err) {
    console.log('ℹ️ PostgreSQL connection failed (' + err.message + '). Switching to local JSON database storage (server/local_db.json)...');
    useLocal = true;
    loadLocalDB();
    saveLocalDB();
    console.log('✅ Local database storage ready');
  }
}

module.exports = { pool, initDB };
