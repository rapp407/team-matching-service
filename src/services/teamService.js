const { query, getClient } = require('../db');

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

      await client.query('COMMIT');
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

module.exports = {
  createTeam,
  inviteMemberToTeam,
  respondToInvite,
  getPoolEntryByStudentAndPeriod,
  getTeamById,
  getTeamMemberByStudentId,
  getInviteById,
};
