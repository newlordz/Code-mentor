const express        = require('express');
const { pool }       = require('../db');
const authMiddleware = require('../middleware/auth');
const router         = express.Router();

// All progress routes require auth
router.use(authMiddleware);

// ── GET /api/progress ───────────────────────────────────────────
// Returns all progress rows for the current student
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT language, topic_id, completed, score, updated_at FROM progress WHERE student_id = $1',
      [req.user.id]
    );
    res.json({ progress: result.rows });
  } catch (err) {
    console.error('Get progress error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/progress ──────────────────────────────────────────
// Upsert a single topic progress entry
router.post('/', async (req, res) => {
  const { language, topic_id, completed, score } = req.body;

  if (!language || !topic_id) {
    return res.status(400).json({ error: 'language and topic_id are required' });
  }

  try {
    await pool.query(`
      INSERT INTO progress (student_id, language, topic_id, completed, score, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      ON CONFLICT (student_id, language, topic_id)
      DO UPDATE SET
        completed  = EXCLUDED.completed,
        score      = GREATEST(progress.score, EXCLUDED.score),
        updated_at = NOW()
    `, [req.user.id, language, topic_id, !!completed, score || 0]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Save progress error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
