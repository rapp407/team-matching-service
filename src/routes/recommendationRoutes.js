const express = require('express');
const auth = require('../middleware/auth');
const { getMemberRecommendations, getTeamRecommendations } = require('../services/recommendationService');
const { getTeamById } = require('../services/teamService');

const router = express.Router();

// FR-014: PO minta rekomendasi anggota
router.get('/recommendations/members', auth, async (req, res) => {
  try {
    const { team_id } = req.query; 
    if (!team_id) return res.status(400).json({ error: 'team_id required' });

    // 1. Cek apakah tim ada (Jika tidak ada, kembalikan 404, bukan 403)
    const team = await getTeamById(team_id);
    if (!team) {
      return res.status(404).json({ error: 'team_not_found', detail: `Tim dengan ID ${team_id} tidak ditemukan` });
    }

    // 2. Cek otoritas dengan menyamakan tipe datanya menjadi String
    if (String(team.po_student_id) !== String(req.user.student_id)) {
      return res.status(403).json({ 
        error: 'forbidden', 
        detail: `Hanya PO tim yang berhak melihat rekomendasi (PO: ${team.po_student_id}, Kamu: ${req.user.student_id})` 
      });
    }

    // 3. Panggil service V3
    const recommendations = await getMemberRecommendations(team_id);
    res.json({ success: true, data: { team_id, recommendations } });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'internal_error' });
  }
});

// FR-015: Talent minta rekomendasi tim
router.get('/recommendations/teams', auth, async (req, res) => {
  try {
    const { period = '2024-1' } = req.query;
    
    // Panggil service V3
    const recommendations = await getTeamRecommendations(req.user.student_id, period);
    res.json({ success: true, data: { recommendations } });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'internal_error' });
  }
});

module.exports = router;