const { query } = require('../db');

// Menghitung Jaccard Similarity untuk menyelaraskan SDG (FR-018)
function calculateJaccard(setA, setB) {
  const intersection = new Set([...setA].filter(x => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return union.size === 0 ? 0 : intersection.size / union.size;
}

function calculateSDGAlignment(membersSDGs) {
  if (membersSDGs.length < 2) return 1.0;
  let totalScore = 0;
  let pairs = 0;
  for (let i = 0; i < membersSDGs.length; i++) {
    for (let j = i + 1; j < membersSDGs.length; j++) {
      totalScore += calculateJaccard(new Set(membersSDGs[i]), new Set(membersSDGs[j]));
      pairs++;
    }
  }
  return totalScore / pairs;
}

// Menghitung Coefficient of Variation (CV) untuk keseimbangan skill (FR-017)
function calculateCV(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  if (mean === 0) return 0;
  const variance = values.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function calculateSkillBalanceScore(membersSkillsList) {
  if (membersSkillsList.length < 2) return 1.0;
  const dimensions = ['programming', 'design', 'management', 'research', 'communication'];
  let cvSum = 0;

  dimensions.forEach(dim => {
    // Ambil nilai skill tiap dimensi dari seluruh anggota tim (default 0 jika tidak ada)
    const values = membersSkillsList.map(skills => skills[dim] || 0);
    cvSum += calculateCV(values);
  });

  const meanCV = cvSum / dimensions.length;
  const score = 1 - meanCV;
  return Math.max(0, Math.min(1, score)); // Pastikan skor berada di rentang 0 - 1
}

// Fungsi utama untuk mengkalkulasi ulang dan menyimpan skor tim
async function recalculateTeamScores(teamId, period) {
  // 1. Ambil data semua anggota di tim ini yang masih aktif
  const membersRes = await query(
    `SELECT p.skills, p.sdg_topics 
     FROM team_members tm
     JOIN pool_entries p ON tm.student_id = p.student_id AND p.period = $2
     WHERE tm.team_id = $1 AND tm.left_at IS NULL`,
    [teamId, period]
  );

  const members = membersRes.rows;
  if (members.length === 0) return;

  const membersSkillsList = members.map(m => m.skills || {});
  const membersSDGsList = members.map(m => m.sdg_topics || []);

  const skillBalance = calculateSkillBalanceScore(membersSkillsList);
  const sdgAlignment = calculateSDGAlignment(membersSDGsList);

  // 2. Simpan skor ke database
  await query(
    `UPDATE teams 
     SET skill_balance_score = $1, sdg_alignment_score = $2 
     WHERE id = $3`,
    [skillBalance, sdgAlignment, teamId]
  );
}

module.exports = { recalculateTeamScores };