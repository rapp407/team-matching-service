const { query, getClient } = require('../db');

async function getProfileSkills(studentId, period = '2024-1') {
  // PERBAIKAN V3: Menggunakan LEFT JOIN dan json_object_agg untuk membaca talent_skills
  const result = await query(
    `SELECT p.sdg_topics,
       COALESCE(
         json_object_agg(ts.skill_name, ts.skill_level) FILTER (WHERE ts.skill_name IS NOT NULL),
         '{}'::json
       ) as skills
     FROM pool_entries p
     LEFT JOIN talent_skills ts ON p.student_id = ts.student_id AND ts.period = p.period
     WHERE p.student_id = $1 AND p.period = $2 AND p.deleted_at IS NULL
     GROUP BY p.id
     ORDER BY p.created_at DESC LIMIT 1`,
    [studentId, period]
  );
  
  if (result.rows.length === 0) throw { status: 404, message: 'profile_not_found' };
  return result.rows[0];
}

async function updateProfileSkills(studentId, period, skills, sdgTopics) {
  const client = await getClient();
  
  try {
    await client.query('BEGIN');

    // 1. Update sdg_topics di tabel pool_entries
    const updatePool = await client.query(
      `UPDATE pool_entries 
       SET sdg_topics = $1, updated_at = CURRENT_TIMESTAMP 
       WHERE student_id = $2 AND period = $3 AND deleted_at IS NULL 
       RETURNING id`,
      [sdgTopics, studentId, period]
    );

    if (updatePool.rows.length === 0) {
      throw { status: 404, message: 'profile_not_found', detail: 'Mahasiswa tidak ditemukan di pool' };
    }

    // 2. Hapus skill lama agar tidak duplikat
    await client.query(
      `DELETE FROM talent_skills WHERE student_id = $1 AND period = $2`, 
      [studentId, period]
    );

    // 3. Masukkan skill baru ke tabel talent_skills (Migrasi V3)
    if (skills && typeof skills === 'object') {
      const skillEntries = Object.entries(skills);
      for (const [skillName, skillLevel] of skillEntries) {
        await client.query(
          `INSERT INTO talent_skills (student_id, skill_name, skill_level, period) 
           VALUES ($1, $2, $3, $4)`,
          [studentId, String(skillName).toLowerCase(), parseInt(skillLevel) || 1, period]
        );
      }
    }

    await client.query('COMMIT');
    return { skills, sdg_topics: sdgTopics };

  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { getProfileSkills, updateProfileSkills };