const { query, getClient } = require('../db');
const { recalculateTeamScores } = require('./advancedScoringService');

async function getPoolEntryByStudentAndPeriod(studentId, period) {
  const result = await query(
    `SELECT id, student_id, student_name, program_studi, sdg_topics, availability, notes, status, period
     FROM pool_entries
     WHERE student_id = $1 AND period = $2 AND deleted_at IS NULL
     LIMIT 1`,
    [studentId, period]
  );

  return result.rows[0] || null;
}

async function getTeamById(teamId) {
  const result = await query(
    `SELECT id, name, status, generation_method, period, created_by, po_student_id, created_at
     FROM teams
     WHERE id = $1
     LIMIT 1`,
    [teamId]
  );

  return result.rows[0] || null;
}

async function getTeamByPoStudentId(poStudentId) {
  const result = await query(
    `SELECT id, name, status, generation_method, period, created_by, po_student_id, created_at
     FROM teams
     WHERE po_student_id = $1 AND status IN ('forming', 'active')
     LIMIT 1`,
    [poStudentId]
  );

  return result.rows[0] || null;
}

async function getActiveTeamByMember(studentId) {
  const result = await query(
    `SELECT t.id, t.name, t.status, t.period, t.po_student_id
     FROM teams t
     JOIN team_members m ON m.team_id = t.id
     WHERE m.student_id = $1 AND m.left_at IS NULL AND t.status IN ('forming', 'active')
     LIMIT 1`,
    [studentId]
  );

  return result.rows[0] || null;
}

async function getTeamMemberByStudentId(teamId, studentId) {
  const result = await query(
    `SELECT id, team_id, student_id, role_in_team
     FROM team_members
     WHERE team_id = $1 AND student_id = $2 AND left_at IS NULL
     LIMIT 1`,
    [teamId, studentId]
  );

  return result.rows[0] || null;
}

async function createTeam({ name, generation_method = 'manual', period, createdBy, poStudentId, poStudentName, poProgramStudi }) {
  const duplicateTeam = await query(
    `SELECT id
     FROM teams
     WHERE po_student_id = $1 AND period = $2 AND status IN ('forming', 'active')
     LIMIT 1`,
    [poStudentId, period]
  );

  if (duplicateTeam.rows.length > 0) {
    const err = new Error('duplicate_team');
    err.detail = 'Mahasiswa sudah punya tim aktif/forming di period ini';
    err.status = 409;
    throw err;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const teamResult = await client.query(
      `INSERT INTO teams (name, status, generation_method, period, created_by, po_student_id)
       VALUES ($1, 'forming', $2, $3, $4, $5)
       RETURNING id, name, status, generation_method, period, created_by, po_student_id, created_at`,
      [name, generation_method, period, createdBy, poStudentId]
    );

    const team = teamResult.rows[0];

    await client.query(
      `INSERT INTO team_members (team_id, student_id, student_name, program_studi, role_in_team)
       VALUES ($1, $2, $3, $4, 'po')`,
      [team.id, poStudentId, poStudentName, poProgramStudi]
    );

    await client.query(
      `UPDATE pool_entries
       SET status = 'in_team', updated_at = CURRENT_TIMESTAMP
       WHERE student_id = $1 AND period = $2 AND deleted_at IS NULL`,
      [poStudentId, period]
    );

    await client.query('COMMIT');
    return team;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function inviteMemberToTeam({ teamId, inviterStudentId, inviteeStudentId, message = null }) {
  const team = await getTeamById(teamId);
  if (!team) {
    const err = new Error('team_not_found');
    err.detail = 'Tim tidak ditemukan';
    err.status = 404;
    throw err;
  }

  if (team.status !== 'forming') {
    const err = new Error('invalid_team_status');
    err.detail = 'Hanya tim berstatus forming yang bisa mengundang anggota';
    err.status = 400;
    throw err;
  }

  if (team.po_student_id !== inviterStudentId) {
    const err = new Error('forbidden');
    err.detail = 'Hanya PO tim yang boleh mengirim undangan';
    err.status = 403;
    throw err;
  }

  const inviterMember = await getTeamMemberByStudentId(teamId, inviterStudentId);
  if (!inviterMember || inviterMember.role_in_team !== 'po') {
    const err = new Error('forbidden');
    err.detail = 'Hanya PO tim yang boleh mengirim undangan';
    err.status = 403;
    throw err;
  }

  const inviteePoolEntry = await getPoolEntryByStudentAndPeriod(inviteeStudentId, team.period);
  if (!inviteePoolEntry) {
    const err = new Error('invitee_not_found');
    err.detail = 'Mahasiswa yang diundang tidak ditemukan di pool pada period ini';
    err.status = 404;
    throw err;
  }

  if (inviteePoolEntry.status !== 'waiting') {
    const err = new Error('invitee_not_available');
    err.detail = 'Mahasiswa yang diundang harus berstatus waiting';
    err.status = 400;
    throw err;
  }

  const existingInvite = await query(
    `SELECT id
     FROM team_invites
     WHERE team_id = $1 AND invitee_student_id = $2 AND status = 'pending'
     LIMIT 1`,
    [teamId, inviteeStudentId]
  );

  if (existingInvite.rows.length > 0) {
    const err = new Error('duplicate_invite');
    err.detail = 'Undangan pending sudah ada untuk mahasiswa ini';
    err.status = 409;
    throw err;
  }

  const inviteResult = await query(
    `INSERT INTO team_invites (team_id, inviter_student_id, invitee_student_id, status, message)
     VALUES ($1, $2, $3, 'pending', $4)
     RETURNING id, team_id, inviter_student_id, invitee_student_id, status, message, created_at, responded_at`,
    [teamId, inviterStudentId, inviteeStudentId, message]
  );

  return inviteResult.rows[0];
}

async function getInviteById(inviteId) {
  const result = await query(
    `SELECT id, team_id, inviter_student_id, invitee_student_id, status, message, created_at, responded_at
     FROM team_invites
     WHERE id = $1
     LIMIT 1`,
    [inviteId]
  );

  return result.rows[0] || null;
}

async function respondToInvite({ inviteId, respondentStudentId, response }) {
  const invite = await getInviteById(inviteId);
  if (!invite) {
    const err = new Error('invite_not_found');
    err.detail = 'Undangan tidak ditemukan';
    err.status = 404;
    throw err;
  }

  if (invite.invitee_student_id !== respondentStudentId) {
    const err = new Error('forbidden');
    err.detail = 'Hanya penerima undangan yang boleh merespon';
    err.status = 403;
    throw err;
  }

  if (invite.status !== 'pending') {
    const err = new Error('invalid_invite_status');
    err.detail = `Undangan sudah ${invite.status}`;
    err.status = 400;
    throw err;
  }

  const team = await getTeamById(invite.team_id);
  if (!team) {
    const err = new Error('team_not_found');
    err.detail = 'Tim pada undangan tidak ditemukan';
    err.status = 404;
    throw err;
  }

  const inviteePoolEntry = await getPoolEntryByStudentAndPeriod(invite.invitee_student_id, team.period);
  if (!inviteePoolEntry) {
    const err = new Error('invitee_not_found');
    err.detail = 'Mahasiswa penerima undangan tidak ditemukan di pool pada period ini';
    err.status = 404;
    throw err;
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

    if (response === 'accepted') {
      const existingMember = await client.query(
        `SELECT id
         FROM team_members
         WHERE team_id = $1 AND student_id = $2 AND left_at IS NULL
         LIMIT 1`,
        [invite.team_id, invite.invitee_student_id]
      );

      if (existingMember.rows.length > 0) {
        const err = new Error('already_member');
        err.detail = 'Mahasiswa sudah menjadi anggota tim';
        err.status = 409;
        throw err;
      }

      if (inviteePoolEntry.status !== 'waiting') {
        const err = new Error('invitee_not_available');
        err.detail = 'Mahasiswa penerima undangan harus berstatus waiting';
        err.status = 400;
        throw err;
      }

      await client.query(
        `INSERT INTO team_members (team_id, student_id, student_name, program_studi, role_in_team)
         VALUES ($1, $2, $3, $4, 'member')`,
        [invite.team_id, invite.invitee_student_id, inviteePoolEntry.student_name, inviteePoolEntry.program_studi]
      );

      await client.query(
        `UPDATE pool_entries
         SET status = 'in_team', updated_at = CURRENT_TIMESTAMP
         WHERE student_id = $1 AND period = $2 AND deleted_at IS NULL`,
        [invite.invitee_student_id, team.period]
      );

      const updateInviteResult = await client.query(
        `UPDATE team_invites
         SET status = 'accepted', responded_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, team_id, inviter_student_id, invitee_student_id, status, message, created_at, responded_at`,
        [inviteId]
      );

      // Patenkan ke database sebelum kalkulasi
      await client.query('COMMIT');

      // Kalkulasi skor Advanced (Level 3)
      try {
        await recalculateTeamScores(invite.team_id, team.period);
      } catch (scoreError) {
        console.error('[SCORING ERROR] Gagal menghitung ulang skor tim:', scoreError);
      }

      return updateInviteResult.rows[0];
    }

    if (response === 'rejected') {
      const updateInviteResult = await client.query(
        `UPDATE team_invites
         SET status = 'rejected', responded_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, team_id, inviter_student_id, invitee_student_id, status, message, created_at, responded_at`,
        [inviteId]
      );

      await client.query('COMMIT');
      return updateInviteResult.rows[0];
    }

    const err = new Error('invalid_response');
    err.detail = 'Response harus accepted atau rejected';
    err.status = 400;
    throw err;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function updateRequiredSkills(teamId, poStudentId, requiredSkills) {
  const team = await getTeamById(teamId);
  if (!team) throw { status: 404, message: 'team_not_found' };
  if (team.po_student_id !== poStudentId) throw { status: 403, message: 'forbidden', detail: 'Hanya PO yang bisa update' };

  const result = await query(
    `UPDATE teams SET required_skills = $1 WHERE id = $2 RETURNING id, name, required_skills`,
    [JSON.stringify(requiredSkills), teamId]
  );
  return result.rows[0];
}

async function getTeamList() {
  // legacy: no filter
  const result = await query(`SELECT id, name, status, required_skills, po_student_id FROM teams WHERE status = 'forming'`);
  return result.rows;
}

// New: filtered list by skill when provided (skill should be a string)
async function getTeamListBySkill(needsSkill) {
  if (!needsSkill) return getTeamList();

  // Use jsonb ? operator which returns true if the string exists in top-level JSON array
  const result = await query(
    `SELECT id, name, status, required_skills, po_student_id FROM teams WHERE status = 'forming' AND required_skills ? $1`,
    [needsSkill]
  );
  return result.rows;
}

async function getTeamDetail(teamId) {
  const teamResult = await query(`SELECT * FROM teams WHERE id = $1`, [teamId]);
  if (teamResult.rows.length === 0) return null;
  
  const memberResult = await query(`SELECT student_id, student_name, role_in_team FROM team_members WHERE team_id = $1 AND left_at IS NULL`, [teamId]);
  
  const team = teamResult.rows[0];
  team.members = memberResult.rows;
  return team;
}

async function createJoinRequest({ teamId, studentId, message }) {
  const team = await getTeamById(teamId);
  if (!team || team.status !== 'forming') throw { status: 400, message: 'invalid_team' };

  const poolCheck = await getPoolEntryByStudentAndPeriod(studentId, team.period);
  if (!poolCheck || poolCheck.status !== 'waiting') throw { status: 400, message: 'invalid_pool_status' };

  const result = await query(
    `INSERT INTO team_join_requests (team_id, requester_student_id, message, status) VALUES ($1, $2, $3, 'pending') RETURNING *`,
    [teamId, studentId, message]
  );
  return result.rows[0];
}

async function respondJoinRequest({ requestId, poStudentId, response }) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    
    const reqResult = await client.query(`SELECT * FROM team_join_requests WHERE id = $1 AND status = 'pending'`, [requestId]);
    if (reqResult.rows.length === 0) throw { status: 404, message: 'request_not_found' };
    const joinReq = reqResult.rows[0];

    const team = await getTeamById(joinReq.team_id);
    if (team.po_student_id !== poStudentId) throw { status: 403, message: 'forbidden' };

    if (response === 'accepted') {
      const poolCheck = await getPoolEntryByStudentAndPeriod(joinReq.requester_student_id, team.period);
      await client.query(
        `INSERT INTO team_members (team_id, student_id, student_name, program_studi, role_in_team) VALUES ($1, $2, $3, $4, 'member')`, 
        [team.id, joinReq.requester_student_id, poolCheck.student_name, poolCheck.program_studi]
      );
      await client.query(`UPDATE pool_entries SET status = 'in_team' WHERE student_id = $1 AND period = $2`, [joinReq.requester_student_id, team.period]);
    }

    const updatedReq = await client.query(`UPDATE team_join_requests SET status = $1 WHERE id = $2 RETURNING *`, [response, requestId]);
    await client.query('COMMIT');
    
    // Kalkulasi skor jika di-accept
    if (response === 'accepted') {
      try { await recalculateTeamScores(team.id, team.period); } catch (e) { console.error(e); }
    }
    
    return updatedReq.rows[0];
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function removeMember(teamId, targetStudentId, period) {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    await client.query(`UPDATE team_members SET left_at = CURRENT_TIMESTAMP WHERE team_id = $1 AND student_id = $2 AND left_at IS NULL`, [teamId, targetStudentId]);
    await client.query(`UPDATE pool_entries SET status = 'waiting' WHERE student_id = $1 AND period = $2`, [targetStudentId, period]);
    await client.query('COMMIT');
    
    // Hitung ulang skor setelah member keluar
    try { await recalculateTeamScores(teamId, period); } catch (e) { console.error(e); }
    
    return { success: true };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = {
  createTeam,
  inviteMemberToTeam,
  respondToInvite,
  getPoolEntryByStudentAndPeriod,
  getTeamById,
  getTeamByPoStudentId,
  getActiveTeamByMember,
  getTeamMemberByStudentId,
  getInviteById,
  updateRequiredSkills,
  getTeamList,
  getTeamListBySkill,
  getTeamDetail,
  createJoinRequest,
  respondJoinRequest,
  removeMember,
};