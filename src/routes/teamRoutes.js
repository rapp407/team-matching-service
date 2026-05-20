const express = require('express');
const auth = require('../middleware/auth');
const { 
  createTeam, inviteMemberToTeam, respondToInvite, getPoolEntryByStudentAndPeriod,
  updateRequiredSkills, getTeamList, getTeamDetail, createJoinRequest, respondJoinRequest, removeMember, getTeamByPoStudentId
} = require('../services/teamService');

const router = express.Router();

function requireStudentRole(req, res, next) {
  if (!req.user || req.user.role !== 'student') {
    return res.status(403).json({ error: 'forbidden', detail: 'Only student can perform this action' });
  }
  return next();
}

async function handleCreateJoinRequest(req, res, teamId) {
  try {
    if (!teamId) {
      return res.status(400).json({ error: 'missing_required_fields', required: ['team_id'] });
    }

    const result = await createJoinRequest({
      teamId,
      studentId: req.user.student_id,
      message: req.body.message || null,
    });

    return res.status(201).json({ data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || 'internal_error' });
  }
}

/** ==========================================
 * 1. TEAM CORE & DISCOVERY
 * ========================================== */

// POST /teams (Buat tim baru)
router.post('/teams', auth, requireStudentRole, async (req, res) => {
  try {
    // generation_method dihapus sesuai arsitektur V3
    const { name, period } = req.body;
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
      name, period, createdBy: student_id, 
      poStudentId: student_id, poStudentName: student_name, poProgramStudi: poolEntry.program_studi,
    });

    return res.status(201).json({ data: team });
  } catch (err) {
    if (err.message === 'duplicate_team') return res.status(err.status || 409).json({ error: 'duplicate_team', detail: err.detail });
    return res.status(500).json({ error: 'internal_error' });
  }
});

// PUT /teams/:id/required-skills (PO set skill target)
router.put('/teams/:id/required-skills', auth, requireStudentRole, async (req, res) => {
  try {
    const { required_skills } = req.body;
    const result = await updateRequiredSkills(req.params.id, req.user.student_id, required_skills);
    res.json({ data: result });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'internal_error' });
  }
});

// GET /teams (Lihat daftar tim forming)
router.get('/teams', auth, async (req, res) => {
  try {
    const needsSkill = req.query.needs_skill || req.query.needsSkill || null;
    const teams = needsSkill ? await getTeamListBySkill(needsSkill) : await getTeamList();
    res.json({ data: teams });
  } catch (err) { 
    res.status(500).json({ error: 'internal_error' }); 
  }
});

// GET /teams/:id (Lihat komposisi dan SKOR tim)
router.get('/teams/:id', auth, async (req, res) => {
  try {
    const team = await getTeamDetail(req.params.id);
    if (!team) return res.status(404).json({ error: 'team_not_found' });
    res.json({ data: team });
  } catch (err) { 
    res.status(500).json({ error: 'internal_error' }); 
  }
});


/** ==========================================
 * 2. INVITATIONS (PO undang Talent)
 * ========================================== */

// POST /teams/:id/invites (PO kirim undangan)
router.post('/teams/:id/invites', auth, requireStudentRole, async (req, res) => {
  try {
    const { id } = req.params;
    const { invitee_student_id, message } = req.body;

    if (!invitee_student_id) return res.status(400).json({ error: 'missing_required_fields', required: ['invitee_student_id'] });

    const invite = await inviteMemberToTeam({
      teamId: id, inviterStudentId: req.user.student_id, inviteeStudentId: invitee_student_id, message: message || null,
    });
    return res.status(201).json({ data: invite });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'internal_error', detail: err.detail });
  }
});

// PUT /invites/:id/respond (Talent terima/tolak undangan)
router.put('/invites/:id/respond', auth, requireStudentRole, async (req, res) => {
  try {
    const { response } = req.body;
    if (!response) return res.status(400).json({ error: 'missing_required_fields', required: ['response'] });

    const normalizedResponse = String(response).toLowerCase();
    if (!['accepted', 'rejected'].includes(normalizedResponse)) {
      return res.status(400).json({ error: 'invalid_response', detail: 'response harus accepted atau rejected' });
    }

    const invite = await respondToInvite({
      inviteId: req.params.id, respondentStudentId: req.user.student_id, response: normalizedResponse,
    });
    return res.status(200).json({ data: invite });
  } catch (err) {
    res.status(err.status || 500).json({ error: err.message || 'internal_error', detail: err.detail });
  }
});


/** ==========================================
 * 3. JOIN REQUESTS (Talent memohon gabung)
 * ========================================== */

// POST /join-requests (Talent apply ke tim via payload team_id)
router.post('/join-requests', auth, requireStudentRole, async (req, res) => {
  return handleCreateJoinRequest(req, res, req.body.team_id || req.body.teamId);
});

// PUT /join-requests/:req/respond (PO acc/reject permohonan) - global alias
router.put('/join-requests/:req/respond', auth, requireStudentRole, async (req, res) => {
  try {
    const { req: reqId } = req.params;
    const { action } = req.body;
    if (!action) return res.status(400).json({ error: 'missing_required_fields', required: ['action'] });

    const normalizedAction = String(action).toLowerCase();
    if (!['accepted', 'rejected'].includes(normalizedAction)) {
      return res.status(400).json({ error: 'invalid_action', detail: "action harus accepted atau rejected" });
    }

    const result = await respondJoinRequest({ requestId: reqId, poStudentId: req.user.student_id, response: normalizedAction });
    return res.json({ data: result });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || 'internal_error' });
  }
});

// POST /teams/:id/join-requests (Talent apply ke tim)
router.post('/teams/:id/join-requests', auth, requireStudentRole, async (req, res) => {
  return handleCreateJoinRequest(req, res, req.params.id);
});

// PUT /teams/:id/join-requests/:req_id (PO acc/reject permohonan)
router.put('/teams/:id/join-requests/:req_id', auth, requireStudentRole, async (req, res) => {
  try {
    const result = await respondJoinRequest({
      requestId: req.params.req_id, poStudentId: req.user.student_id, response: req.body.action
    });
    res.json({ data: result });
  } catch (err) { 
    res.status(err.status || 500).json({ error: err.message || 'internal_error' }); 
  }
});

// DELETE /members/:sid (PO kick member dari tim mereka) - global alias
router.delete('/members/:sid', auth, requireStudentRole, async (req, res) => {
  try {
    const targetSid = req.params.sid;

    const team = await getTeamByPoStudentId(req.user.student_id);
    if (!team || team.po_student_id !== req.user.student_id) return res.status(403).json({ error: 'forbidden' });

    await removeMember(team.id, targetSid, team.period);
    return res.json({ message: 'Member berhasil dikeluarkan' });
  } catch (err) {
    return res.status(err.status || 500).json({ error: err.message || 'internal_error' });
  }
});


/** ==========================================
 * 4. MEMBER MANAGEMENT (Kick / Leave)
 * ========================================== */

// DELETE /teams/:id/members/:sid (PO kick member)
router.delete('/teams/:id/members/me', auth, requireStudentRole, async (req, res) => {
  try {
    const team = await getTeamDetail(req.params.id);
    if (!team) return res.status(404).json({ error: 'team_not_found' });
    if (team.po_student_id === req.user.student_id) return res.status(400).json({ error: 'po_cannot_leave' }); 

    await removeMember(req.params.id, req.user.student_id, team.period);
    res.json({ message: 'Berhasil keluar dari tim' });
  } catch (err) { 
    res.status(err.status || 500).json({ error: err.message || 'internal_error' }); 
  }
});


router.delete('/teams/:id/members/:sid', auth, requireStudentRole, async (req, res) => {
  try {
    const team = await getTeamDetail(req.params.id);
    if (!team || team.po_student_id !== req.user.student_id) return res.status(403).json({ error: 'forbidden' });
    
    await removeMember(req.params.id, req.params.sid, team.period);
    res.json({ message: 'Member berhasil dikeluarkan' });
  } catch (err) { 
    res.status(err.status || 500).json({ error: err.message || 'internal_error' }); 
  }
});



module.exports = router;