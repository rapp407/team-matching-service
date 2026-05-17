const { query } = require('../db');

async function getProfileSkills(studentId, period = '2024-1') {
  const result = await query(
    `SELECT skills, sdg_topics FROM pool_entries 
     WHERE student_id = $1 AND period = $2 AND deleted_at IS NULL 
     ORDER BY created_at DESC LIMIT 1`,
    [studentId, period]
  );
  if (result.rows.length === 0) throw { status: 404, message: 'profile_not_found' };
  return result.rows[0];
}

async function updateProfileSkills(studentId, period, skills, sdgTopics) {
  const result = await query(
    `UPDATE pool_entries 
     SET skills = $1, sdg_topics = $2, updated_at = CURRENT_TIMESTAMP 
     WHERE student_id = $3 AND period = $4 AND deleted_at IS NULL 
     RETURNING skills, sdg_topics`,
    [JSON.stringify(skills), sdgTopics, studentId, period]
  );
  
  if (result.rows.length === 0) throw { status: 404, message: 'profile_not_found' };
  return result.rows[0];
}

module.exports = { getProfileSkills, updateProfileSkills };