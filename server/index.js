require('dotenv').config();
const express  = require('express');
const cors     = require('cors');
const path     = require('path');
const { initDB } = require('./db');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middleware ──────────────────────────────────────────────────
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── Static files (serve the frontend) ──────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── API Routes ──────────────────────────────────────────────────
app.use('/api/auth',     require('./routes/auth'));
app.use('/api/progress', require('./routes/progress'));
app.use('/api/run',      require('./routes/run'));

// ── Catch-all: serve index.html for SPA routing ─────────────────
app.get('*', (req, res) => {
  // API 404s shouldn't fall through
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// ── Boot ────────────────────────────────────────────────────────
async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`\n🚀 CodeMentor AI running at http://localhost:${PORT}`);
      console.log(`   Sign In page: http://localhost:${PORT}/auth.html`);
      console.log(`   Main app:     http://localhost:${PORT}/\n`);
    });
  } catch (err) {
    console.error('Failed to start server. Full error details:', err);
    process.exit(1);
  }
}

start();
