const express = require('express');
const auth = require('../middleware/auth');
const { createTeam, inviteMemberToTeam, getPoolEntryByStudentAndPeriod } = require('../services/teamService');

const router = express.Router();

function requireStudentRole(req, res, next) {
  if (!req.user || req.user.role !== 'student') {
    return res.status(403).json({ error: 'forbidden', detail: 'Only student can perform this action' });
  }
  return next();
}

/**
 * POST /teams
 * Mahasiswa buat tim, otomatis jadi PO, tim status forming
 * Body: { name, period, generation_method? }
 */
router.post('/teams', auth, requireStudentRole, async (req, res) => {
  try {
    const { name, period, generation_method = 'manual' } = req.body;
    const { student_id, student_name } = req.user;

    if (!name || !period) {
      return res.status(400).json({ error: 'missing_required_fields', required: ['name', 'period'] });
    }

    const poolEntry = await getPoolEntryByStudentAndPeriod(student_id, period);
    if (!poolEntry) {
      return res.status(404).json({ error: 'pool_entry_not_found', detail: 'Mahasiswa harus join pool dulu sebelum buat tim' });
    }

    if (poolEntry.status !== 'waiting') {
      return res.status(400).json({ error: 'invalid_pool_status', detail: `Pool status harus waiting, saat ini ${poolEntry.status}` });
    }

    const team = await createTeam({
      name,
      generation_method,
      period,
      createdBy: student_id,
      poStudentId: student_id,
      poStudentName: student_name,
      poProgramStudi: poolEntry.program_studi,
    });

    return res.status(201).json({ data: team });
  } catch (err) {
    if (err.message === 'duplicate_team') {
      return res.status(err.status || 409).json({ error: 'duplicate_team', detail: err.detail });
    }
    console.error('[TEAM] POST /teams error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

/**
 * POST /teams/:id/invites
 * PO undang mahasiswa dari pool
 * Body: { invitee_student_id, message? }
 */
router.post('/teams/:id/invites', auth, requireStudentRole, async (req, res) => {
  try {
    const { id } = req.params;
    const { invitee_student_id, message } = req.body;
    const { student_id } = req.user;

    if (!invitee_student_id) {
      return res.status(400).json({ error: 'missing_required_fields', required: ['invitee_student_id'] });
    }

    const invite = await inviteMemberToTeam({
      teamId: id,
      inviterStudentId: student_id,
      inviteeStudentId: invitee_student_id,
      message: message || null,
    });

    return res.status(201).json({ data: invite });
  } catch (err) {
    if (err.message === 'team_not_found') {
      return res.status(err.status || 404).json({ error: 'team_not_found', detail: err.detail });
    }
    if (err.message === 'invalid_team_status') {
      return res.status(err.status || 400).json({ error: 'invalid_team_status', detail: err.detail });
    }
    if (err.message === 'forbidden') {
      return res.status(err.status || 403).json({ error: 'forbidden', detail: err.detail });
    }
    if (err.message === 'invitee_not_found') {
      return res.status(err.status || 404).json({ error: 'invitee_not_found', detail: err.detail });
    }
    if (err.message === 'invitee_not_available') {
      return res.status(err.status || 400).json({ error: 'invitee_not_available', detail: err.detail });
    }
    if (err.message === 'duplicate_invite') {
      return res.status(err.status || 409).json({ error: 'duplicate_invite', detail: err.detail });
    }
    console.error('[TEAM] POST /teams/:id/invites error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

module.exports = router;
