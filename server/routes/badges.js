const express = require('express');
const { pool } = require('../db');
const authMiddleware = require('../middleware/auth');
const router = express.Router();

router.use(authMiddleware);

// GET /api/badges
router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT badge_id, earned_at FROM badges WHERE student_id = $1',
      [req.user.id]
    );
    res.json({ badges: result.rows });
  } catch (err) {
    console.error('Get badges error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// POST /api/badges
router.post('/', async (req, res) => {
  const { badge_id } = req.body;
  if (!badge_id) {
    return res.status(400).json({ error: 'badge_id is required' });
  }

  try {
    await pool.query(`
      INSERT INTO badges (student_id, badge_id, earned_at)
      VALUES ($1, $2, NOW())
      ON CONFLICT (student_id, badge_id) DO NOTHING
    `, [req.user.id, badge_id]);

    res.json({ ok: true });
  } catch (err) {
    console.error('Award badge error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
