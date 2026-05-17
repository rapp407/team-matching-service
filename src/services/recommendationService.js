const { query } = require('../db');

// Fungsi pembantu untuk mengecek kecocokan skill (Mendukung Array Level 1 & Object Level 3)
function calculateSkillMatch(reqSkills, talentSkills) {
  if (!reqSkills || !Array.isArray(reqSkills) || reqSkills.length === 0) return 1; // Jika tim tidak mensyaratkan apa-apa, otomatis 100% cocok

  let matchCount = 0;
  
  reqSkills.forEach(req => {
    let reqName = (req.name || '').toLowerCase();
    let hasSkill = false;

    if (Array.isArray(talentSkills)) {
      // Logika Level 1: Cek apakah nama skill ada di dalam array
      hasSkill = !!talentSkills.find(s => s.name && s.name.toLowerCase() === reqName);
    } else if (talentSkills && typeof talentSkills === 'object') {
      // Logika Level 3: Cek atribut object
      if (talentSkills[reqName] && talentSkills[reqName] > 0) {
        hasSkill = true;
      } else {
        // Penerjemah cerdas: jika tim butuh "ui/ux", cek apakah talent punya skill "design"
        if ((reqName.includes('ui') || reqName.includes('ux')) && talentSkills['design'] > 0) hasSkill = true;
        // Jika butuh "backend"/"frontend", cek apakah punya skill "programming"
        if ((reqName.includes('back') || reqName.includes('front') || reqName.includes('web')) && talentSkills['programming'] > 0) hasSkill = true;
      }
    }

    if (hasSkill) matchCount++;
  });

  return matchCount / reqSkills.length;
}

// Rekomendasi Mahasiswa untuk PO (TC-07)
async function recommendMembersForTeam(teamId) {
  const teamResult = await query(`SELECT id, required_skills, period FROM teams WHERE id = $1`, [teamId]);
  if (teamResult.rows.length === 0) throw { status: 404, message: 'team_not_found' };
  
  const team = teamResult.rows[0];
  const reqSkills = team.required_skills || [];

  // Ambil mahasiswa yang masih waiting di period yang sama
  const poolResult = await query(
    `SELECT student_id, student_name, program_studi, skills, sdg_topics 
     FROM pool_entries 
     WHERE status = 'waiting' AND period = $1 AND deleted_at IS NULL`,
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
  const poolResult = await query(
    `SELECT student_id, skills, sdg_topics FROM pool_entries WHERE student_id = $1 AND period = $2 AND deleted_at IS NULL`,
    [studentId, period]
  );
  if (poolResult.rows.length === 0) throw { status: 404, message: 'pool_entry_not_found' };
  
  const talent = poolResult.rows[0];

  // Ambil tim yang masih forming di period yang sama
  const teamsResult = await query(
    `SELECT id, name, required_skills, po_student_id FROM teams WHERE status = 'forming' AND period = $1`,
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