const { query } = require('../db');

// Fungsi pembantu untuk mengecek kecocokan skill
function calculateSkillMatch(reqSkills, talentSkills) {
  if (!reqSkills || !Array.isArray(reqSkills) || reqSkills.length === 0) return 1; // 100% cocok jika tidak ada syarat

  let matchCount = 0;
  
  reqSkills.forEach(req => {
    let reqName = (req.name || '').toLowerCase();
    let hasSkill = false;

    if (Array.isArray(talentSkills)) {
      // Cek persis nama skill
      hasSkill = !!talentSkills.find(s => s.name && s.name.toLowerCase() === reqName);
      
      // Penerjemah cerdas (Mendukung mapping jika nama skill sedikit berbeda)
      if (!hasSkill) {
        if ((reqName.includes('ui') || reqName.includes('ux')) && talentSkills.find(s => s.name && s.name.toLowerCase() === 'design')) hasSkill = true;
        if ((reqName.includes('back') || reqName.includes('front') || reqName.includes('web')) && talentSkills.find(s => s.name && s.name.toLowerCase() === 'programming')) hasSkill = true;
      }
    } else if (talentSkills && typeof talentSkills === 'object') {
      // Fallback untuk logika object lama (jika masih tersisa)
      if (talentSkills[reqName] && talentSkills[reqName] > 0) {
        hasSkill = true;
      } else {
        if ((reqName.includes('ui') || reqName.includes('ux')) && talentSkills['design'] > 0) hasSkill = true;
        if ((reqName.includes('back') || reqName.includes('front') || reqName.includes('web')) && talentSkills['programming'] > 0) hasSkill = true;
      }
    }

    if (hasSkill) matchCount++;
  });

  return matchCount / reqSkills.length;
}

// Rekomendasi Mahasiswa untuk PO (TC-07)
async function recommendMembersForTeam(teamId) {
  // Ambil data tim beserta required skills hasil JOIN dan agregasi JSON
  const teamResult = await query(
    `SELECT t.id, t.period, 
       COALESCE(json_agg(json_build_object('name', trs.skill_name, 'count', trs.required_count)) FILTER (WHERE trs.skill_name IS NOT NULL), '[]') as required_skills
     FROM teams t
     LEFT JOIN team_required_skills trs ON t.id = trs.team_id
     WHERE t.id = $1
     GROUP BY t.id, t.period`, 
    [teamId]
  );
  
  if (teamResult.rows.length === 0) throw { status: 404, message: 'team_not_found' };
  
  const team = teamResult.rows[0];
  const reqSkills = team.required_skills || [];

  // Ambil kandidat beserta skills mereka hasil JOIN dan agregasi JSON
  const poolResult = await query(
    `SELECT p.id, p.student_id, p.student_name, p.program_studi, p.sdg_topics,
       COALESCE(json_agg(json_build_object('name', ts.skill_name, 'level', ts.skill_level)) FILTER (WHERE ts.skill_name IS NOT NULL), '[]') as skills
     FROM pool_entries p
     LEFT JOIN talent_skills ts ON p.student_id = ts.student_id AND p.period = ts.period
     WHERE p.status = 'waiting' AND p.period = $1 AND p.deleted_at IS NULL
     GROUP BY p.id`, 
    [team.period]
  );

  const candidates = poolResult.rows.map(talent => {
    const matchScore = calculateSkillMatch(reqSkills, talent.skills);
    return { ...talent, matchScore };
  });

  // Urutkan dari skor tertinggi (1.0 = 100% cocok)
  return candidates.sort((a, b) => b.matchScore - a.matchScore);
}

// Rekomendasi Tim untuk Mahasiswa (TC-08)
async function recommendTeamsForMember(studentId, period) {
  // Ambil data talent beserta skills hasil JOIN dan agregasi JSON
  const poolResult = await query(
    `SELECT p.id, p.student_id, p.sdg_topics,
       COALESCE(json_agg(json_build_object('name', ts.skill_name, 'level', ts.skill_level)) FILTER (WHERE ts.skill_name IS NOT NULL), '[]') as skills
     FROM pool_entries p
     LEFT JOIN talent_skills ts ON p.student_id = ts.student_id AND p.period = ts.period
     WHERE p.student_id = $1 AND p.period = $2 AND p.deleted_at IS NULL
     GROUP BY p.id`, 
    [studentId, period]
  );
  
  if (poolResult.rows.length === 0) throw { status: 404, message: 'pool_entry_not_found' };
  
  const talent = poolResult.rows[0];

  // Ambil semua tim forming beserta required skills mereka hasil JOIN dan agregasi JSON
  const teamsResult = await query(
    `SELECT t.id, t.name, t.po_student_id,
       COALESCE(json_agg(json_build_object('name', trs.skill_name, 'count', trs.required_count)) FILTER (WHERE trs.skill_name IS NOT NULL), '[]') as required_skills
     FROM teams t
     LEFT JOIN team_required_skills trs ON t.id = trs.team_id
     WHERE t.status = 'forming' AND t.period = $1
     GROUP BY t.id`, 
    [period]
  );

  const recommendedTeams = teamsResult.rows.map(team => {
    const matchScore = calculateSkillMatch(team.required_skills, talent.skills);
    return { ...team, matchScore };
  });

  // Urutkan dari skor tertinggi
  return recommendedTeams.sort((a, b) => b.matchScore - a.matchScore);
}

module.exports = {
  getMemberRecommendations: recommendMembersForTeam,
  getTeamRecommendations: recommendTeamsForMember
};