const express = require('express');
const auth = require('../middleware/auth');
const { getMemberRecommendations, getTeamRecommendations } = require('../services/recommendationService');
const { getTeamById } = require('../services/teamService');

const router = express.Router();

// FR-014: PO minta rekomendasi anggota
router.get('/recommendations/members', auth, async (req, res) => {
  try {
    const { team_id, limit = 10 } = req.query;
    if (!team_id) return res.status(400).json({ error: 'team_id required' });

    // Cek apakah user ini benar-benar PO dari tim tersebut
    const team = await getTeamById(team_id);
    if (!team || team.po_student_id !== req.user.student_id) {
      return res.status(403).json({ error: 'forbidden' });
    }

    const recommendations = await getMemberRecommendations(team_id, team.period, parseInt(limit));
    res.json({ success: true, data: { team_id, recommendations } });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'internal_error' });
  }
});

// FR-015: Talent minta rekomendasi tim
router.get('/recommendations/teams', auth, async (req, res) => {
  try {
    const { period = '2024-1', limit = 10 } = req.query;
    const recommendations = await getTeamRecommendations(req.user.student_id, period, parseInt(limit));
    res.json({ success: true, data: { recommendations } });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'internal_error' });
  }
});

module.exports = router;