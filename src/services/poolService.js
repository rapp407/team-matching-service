const { query, getClient } = require('../db');

// Helper untuk membaca format skills (mendukung format Array Object)
function formatSkills(skillsData) {
  if (!skillsData) return [];
  if (Array.isArray(skillsData)) return skillsData;
  return Object.entries(skillsData).map(([name, level]) => ({ name, level }));
}

/**
 * Join pool - create pool entry untuk mahasiswa
 * @param {string} studentId - student_id dari auth
 * @param {string} studentName - nama student dari auth atau request body
 * @param {string} programStudi - program studi mahasiswa
 * @param {object} data - { sdg_topics: [], availability, notes, period, skills }
 * @returns {object} - pool entry yang baru dibuat
 */
async function joinPool(studentId, studentName, programStudi, data) {
  const { sdg_topics = [], availability = 'full-time', notes = null, period, skills } = data;
  const formattedSkills = formatSkills(skills);

  const client = await getClient();
  try {
    await client.query('BEGIN');

    // 1. Cek keberadaan data (Validasi duplikasi / Rejoin)
    const existingResult = await client.query(
      `SELECT id, status, deleted_at FROM pool_entries WHERE student_id = $1 AND period = $2 LIMIT 1`,
      [studentId, period]
    );

    let poolEntry;

    if (existingResult.rows.length > 0) {
      const existing = existingResult.rows[0];
      
      // Jika user sudah ada tapi withdrawn / deleted, lakukan REJOIN
      if (existing.status === 'withdrawn' || existing.deleted_at !== null) {
        // PERHATIAN: Tidak ada lagi UPDATE kolom 'skills' di sini
        const updateResult = await client.query(
          `UPDATE pool_entries 
           SET status = 'waiting', deleted_at = NULL, updated_at = CURRENT_TIMESTAMP
           WHERE id = $1
           RETURNING id, student_id, student_name, program_studi, sdg_topics, availability, notes, status, period, created_at, updated_at`,
          [existing.id]
        );
        poolEntry = updateResult.rows[0];
      } else {
        throw { 
          status: 409, 
          message: 'duplicate_entry', 
          detail: `Student sudah aktif di pool dengan status: ${existing.status}` 
        };
      }
    } else {
      // Insert baru ke pool_entries (TANPA kolom skills)
      const insertResult = await client.query(
        `INSERT INTO pool_entries (student_id, student_name, program_studi, sdg_topics, availability, notes, status, period)
         VALUES ($1, $2, $3, $4, $5, $6, 'waiting', $7)
         RETURNING *`,
        [studentId, studentName, programStudi, sdg_topics, availability, notes, period]
      );
      poolEntry = insertResult.rows[0];
    }

    // 2. Simpan skill ke tabel relasional talent_skills (Migrasi V3)
    // Hapus data skill lama jika ini adalah proses Rejoin agar tidak duplicate
    await client.query(`DELETE FROM talent_skills WHERE student_id = $1 AND period = $2`, [studentId, period]);
    
    if (formattedSkills.length > 0) {
      for (const skill of formattedSkills) {
        await client.query(
          `INSERT INTO talent_skills (student_id, skill_name, skill_level, period) VALUES ($1, $2, $3, $4)`,
          [studentId, String(skill.name).toLowerCase(), skill.level || 1, period]
        );
      }
    }

    await client.query('COMMIT');
    
    // Tempelkan skills ke response agar frontend tetap mendapatkan datanya
    poolEntry.skills = formattedSkills;
    return poolEntry;

  } catch (err) {
    await client.query('ROLLBACK');
    // Unique constraint on (student_id, period) may still occur under concurrency
    if (err && err.code === '23505') {
      const e = new Error('duplicate_entry');
      e.detail = `Student sudah ada di pool untuk period ${period}`;
      e.status = 409;
      throw e;
    }
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get pool list dengan pagination dan filter
 * @param {object} filters - { period, program_studi, sdg_topic, status, page, limit }
 * @returns {object} - { data: [], total, page, limit }
 */
async function getPoolList(filters = {}) {
  const {
    period = '2024-1',
    program_studi = null,
    sdg_topic = null,
    status = 'waiting',
    page = 1,
    limit = 10,
  } = filters;

  let whereClause = `WHERE period = $1 AND deleted_at IS NULL`;
  let params = [period];
  let paramIndex = 2;

  if (status) {
    whereClause += ` AND status = $${paramIndex}`;
    params.push(status);
    paramIndex++;
  }

  if (program_studi) {
    whereClause += ` AND program_studi = $${paramIndex}`;
    params.push(program_studi);
    paramIndex++;
  }

  if (sdg_topic) {
    whereClause += ` AND $${paramIndex} = ANY(sdg_topics)`;
    params.push(sdg_topic);
    paramIndex++;
  }

  // Count total
  const countResult = await query(`SELECT COUNT(*) as total FROM pool_entries ${whereClause}`, params);
  const total = parseInt(countResult.rows[0].total, 10);

  // Get paginated data
  const offset = (page - 1) * limit;
  const dataResult = await query(
    `SELECT id, student_id, student_name, program_studi, sdg_topics, availability, notes, status, period, created_at, updated_at
     FROM pool_entries ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
    [...params, limit, offset]
  );

  return {
    data: dataResult.rows,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Withdraw dari pool (soft delete)
 * @param {string} studentId - student_id dari auth
 * @param {string} period - period untuk withdraw
 * @returns {object} - pool entry yang di-withdraw
 */
async function withdrawFromPool(studentId, period) {
  // Check apakah mahasiswa di pool dan belum in_team
  const checkResult = await query(
    `SELECT id, status FROM pool_entries 
     WHERE student_id = $1 AND period = $2 AND deleted_at IS NULL`,
    [studentId, period]
  );

  if (checkResult.rows.length === 0) {
    const err = new Error('not_found');
    err.detail = 'Mahasiswa tidak ditemukan di pool';
    err.status = 404;
    throw err;
  }

  const poolEntry = checkResult.rows[0];

  // Validasi: hanya bisa withdraw jika status 'waiting' (belum in_team)
  if (poolEntry.status !== 'waiting') {
    const err = new Error('invalid_status');
    err.detail = `Tidak bisa keluar pool jika status ${poolEntry.status}`;
    err.status = 400;
    throw err;
  }

  // Update status dan deleted_at
  const updateResult = await query(
    `UPDATE pool_entries 
     SET status = 'withdrawn', deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
     WHERE id = $1
     RETURNING id, student_id, student_name, program_studi, status, period, updated_at`,
    [poolEntry.id]
  );

  return updateResult.rows[0];
}

module.exports = {
  joinPool,
  getPoolList,
  withdrawFromPool,
};