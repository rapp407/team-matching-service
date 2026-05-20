const express = require('express');
const { query } = require('../db');
const router = express.Router();

// Middleware sederhana untuk Service Key
function requireServiceKey(req, res, next) {
  const serviceKey = req.headers['x-service-key'];
  if (serviceKey !== process.env.INTERNAL_SERVICE_KEY) {
    return res.status(401).json({ error: 'unauthorized_service' });
  }
  next();
}

// FR-016: Cek status tim seorang mahasiswa
router.get('/internal/check-team/:student_id', requireServiceKey, async (req, res) => {
  try {
    const { student_id } = req.params;
    
    const result = await query(
      `SELECT tm.role_in_team, t.id as team_id, t.name as team_name, t.status 
       FROM team_members tm
       JOIN teams t ON tm.team_id = t.id
       WHERE tm.student_id = $1 AND tm.left_at IS NULL AND t.status != 'disbanded'
       LIMIT 1`,
      [student_id]
    );

    if (result.rows.length === 0) {
      return res.json({ success: true, data: { student_id, has_team: false } });
    }

    res.json({ 
      success: true, 
      data: { 
        student_id, 
        has_team: true, 
        ...result.rows[0] 
      } 
    });
  } catch (err) {
    res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;