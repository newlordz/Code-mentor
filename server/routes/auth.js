const express   = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { pool }   = require('../db');
const router     = express.Router();

// Avatar colors assigned round-robin
const AVATAR_COLORS = ['#00f5d4','#a855f7','#f59e0b','#3b82f6','#f43f5e','#10b981'];

// ── POST /api/auth/register ─────────────────────────────────────
router.post('/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  try {
    // Check duplicate
    const existing = await pool.query('SELECT id FROM students WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const hash   = await bcrypt.hash(password, 10);
    const color  = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
    const result = await pool.query(
      'INSERT INTO students (name, email, password_hash, avatar_color) VALUES ($1, $2, $3, $4) RETURNING id, name, email, avatar_color, created_at',
      [name.trim(), email.toLowerCase(), hash, color]
    );

    const student = result.rows[0];
    const token   = jwt.sign(
      { id: student.id, name: student.name, email: student.email, avatar_color: student.avatar_color },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.status(201).json({ token, user: { id: student.id, name: student.name, email: student.email, avatar_color: student.avatar_color } });
  } catch (err) {
    console.error('Register error:', err.message);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ── POST /api/auth/login ────────────────────────────────────────
router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  try {
    const result = await pool.query(
      'SELECT id, name, email, password_hash, avatar_color FROM students WHERE email = $1',
      [email.toLowerCase()]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const student = result.rows[0];
    const valid   = await bcrypt.compare(password, student.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const token = jwt.sign(
      { id: student.id, name: student.name, email: student.email, avatar_color: student.avatar_color },
      process.env.JWT_SECRET,
      { expiresIn: '30d' }
    );

    res.json({ token, user: { id: student.id, name: student.name, email: student.email, avatar_color: student.avatar_color } });
  } catch (err) {
    console.error('Login error:', err.message);
    res.status(500).json({ error: 'Server error. Please try again.' });
  }
});

// ── GET /api/auth/me ────────────────────────────────────────────
const authMiddleware = require('../middleware/auth');
router.get('/me', authMiddleware, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT id, name, email, avatar_color, created_at FROM students WHERE id = $1',
      [req.user.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json({ user: result.rows[0] });
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
