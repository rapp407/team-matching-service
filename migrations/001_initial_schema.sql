-- Migration: V3 Schema for team-matching-service (Relational Skills & Clean Architecture)
-- Description: Create tables for pool, teams, team members, invites, requests, and skills

-- ==========================================
-- 1. CORE DOMAIN TABLES
-- ==========================================

-- TABLE: pool_entries
-- Purpose: Mahasiswa yang join pool, menunggu untuk masuk tim
CREATE TABLE IF NOT EXISTS pool_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id VARCHAR(50) NOT NULL,
  student_name VARCHAR(255) NOT NULL,
  program_studi VARCHAR(100) NOT NULL,
  sdg_topics INTEGER[] DEFAULT '{}',
  availability VARCHAR(50) DEFAULT 'full-time',
  notes TEXT,
  status VARCHAR(20) DEFAULT 'waiting' CHECK(status IN ('waiting', 'in_team', 'withdrawn')),
  period VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  UNIQUE(student_id, period) -- Satu mahasiswa hanya bisa di pool sekali per period
);

-- TABLE: talent_skills (PENGGANTI JSONB SKILLS - Temuan 9)
-- Purpose: Menyimpan skill individu secara relasional
CREATE TABLE IF NOT EXISTS talent_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id VARCHAR(50) NOT NULL,
  skill_name VARCHAR(100) NOT NULL,
  skill_level INTEGER NOT NULL CHECK (skill_level BETWEEN 1 AND 10),
  period VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(student_id, skill_name, period) -- Tidak boleh ada skill ganda di period yang sama
);

-- TABLE: teams (PENGHAPUSAN LEGACY FIELD - Temuan 8)
-- Purpose: Data tim yang dibentuk, tracking status dan scoring
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'forming' CHECK(status IN ('forming', 'active', 'disbanded')),
  period VARCHAR(50) NOT NULL,
  created_by VARCHAR(50) NOT NULL,
  po_student_id VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  disbanded_at TIMESTAMP,
  skill_balance_score DECIMAL(4,3),
  sdg_alignment_score DECIMAL(4,3)
  -- Note: generation_method, diversity_score, dan required_skills (JSONB) sudah dihapus
);

-- TABLE: team_required_skills (PENGGANTI JSONB REQUIRED SKILLS - Temuan 9)
-- Purpose: Menyimpan kebutuhan skill dari sebuah tim secara relasional
CREATE TABLE IF NOT EXISTS team_required_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  skill_name VARCHAR(100) NOT NULL,
  required_count INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, skill_name) -- Tidak boleh ada request skill ganda di satu tim
);

-- TABLE: team_members
-- Purpose: Anggota tim, role (PO atau member), tracking join/leave
CREATE TABLE IF NOT EXISTS team_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  student_id VARCHAR(50) NOT NULL,
  student_name VARCHAR(255) NOT NULL,
  program_studi VARCHAR(100) NOT NULL,
  role_in_team VARCHAR(20) DEFAULT 'member' CHECK(role_in_team IN ('po', 'member')),
  joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  left_at TIMESTAMP,
  left_reason VARCHAR(50) CHECK(left_reason IN ('kicked', 'left', 'disbanded', NULL))
);

-- TABLE: team_invites
-- Purpose: Undangan dari PO ke mahasiswa di pool untuk join tim
CREATE TABLE IF NOT EXISTS team_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  inviter_student_id VARCHAR(50) NOT NULL,
  invitee_student_id VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected', 'expired')),
  message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMP
);

-- TABLE: team_join_requests
-- Purpose: Request dari mahasiswa untuk join tim
CREATE TABLE IF NOT EXISTS team_join_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  requester_student_id VARCHAR(50) NOT NULL,
  status VARCHAR(20) DEFAULT 'pending' CHECK(status IN ('pending', 'accepted', 'rejected')),
  message TEXT,
  reject_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  responded_at TIMESTAMP
);


-- ==========================================
-- 2. INDEXES (Performa, Relasi, & Keamanan)
-- ==========================================

-- A. PENCEGAHAN RACE CONDITION (Temuan 5)
-- Memastikan 1 mahasiswa hanya bisa punya 1 membership aktif di tabel team_members
CREATE UNIQUE INDEX IF NOT EXISTS unique_active_member ON team_members(student_id) WHERE left_at IS NULL;

-- B. INDEXES STANDAR (Performa Relasi & Filter)
CREATE INDEX IF NOT EXISTS idx_pool_entries_student_id ON pool_entries(student_id);
CREATE INDEX IF NOT EXISTS idx_pool_entries_period ON pool_entries(period);
CREATE INDEX IF NOT EXISTS idx_pool_entries_status ON pool_entries(status);
CREATE INDEX IF NOT EXISTS idx_pool_entries_program_studi ON pool_entries(program_studi);

CREATE INDEX IF NOT EXISTS idx_teams_period ON teams(period);
CREATE INDEX IF NOT EXISTS idx_teams_status ON teams(status);
CREATE INDEX IF NOT EXISTS idx_teams_po_student_id ON teams(po_student_id);

CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_student_id ON team_members(student_id);
CREATE INDEX IF NOT EXISTS idx_team_members_role_in_team ON team_members(role_in_team);

CREATE INDEX IF NOT EXISTS idx_team_invites_team_id ON team_invites(team_id);
CREATE INDEX IF NOT EXISTS idx_team_invites_invitee_student_id ON team_invites(invitee_student_id);
CREATE INDEX IF NOT EXISTS idx_team_invites_status ON team_invites(status);

CREATE INDEX IF NOT EXISTS idx_team_join_requests_team_id ON team_join_requests(team_id);
CREATE INDEX IF NOT EXISTS idx_team_join_requests_requester_student_id ON team_join_requests(requester_student_id);
CREATE INDEX IF NOT EXISTS idx_team_join_requests_status ON team_join_requests(status);


-- C. INDEXES UNTUK TABEL RELASIONAL BARU (Performa Recommendation Level 2)
CREATE INDEX IF NOT EXISTS idx_talent_skills_name ON talent_skills(skill_name);
CREATE INDEX IF NOT EXISTS idx_talent_skills_student_period ON talent_skills(student_id, period);

CREATE INDEX IF NOT EXISTS idx_team_req_skills_name ON team_required_skills(skill_name);
CREATE INDEX IF NOT EXISTS idx_team_req_skills_team_id ON team_required_skills(team_id);

-- D. GIN INDEX (Hanya tersisa untuk sdg_topics yang menggunakan Array Integer)
CREATE INDEX IF NOT EXISTS idx_pool_entries_sdg_topics ON pool_entries USING GIN (sdg_topics);