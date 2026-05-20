-- Migration: Initial schema for team-matching-service
-- Description: Create tables for pool, teams, team members, invites, and join requests

-- TABLE: pool_entries
-- Purpose: Mahasiswa yang join pool, menunggu untuk masuk tim
CREATE TABLE IF NOT EXISTS pool_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id VARCHAR(50) NOT NULL,
  student_name VARCHAR(255) NOT NULL,
  program_studi VARCHAR(100) NOT NULL,
  sdg_topics INTEGER[] DEFAULT '{}',
  skills JSONB DEFAULT '[]'::jsonb,
  availability VARCHAR(50) DEFAULT 'full-time',
  notes TEXT,
  status VARCHAR(20) DEFAULT 'waiting' CHECK(status IN ('waiting', 'in_team', 'withdrawn')),
  period VARCHAR(50) NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deleted_at TIMESTAMP,
  UNIQUE(student_id, period) -- Satu mahasiswa hanya bisa di pool sekali per period
);

-- TABLE: teams
-- Purpose: Data tim yang dibentuk, tracking status dan scoring
CREATE TABLE IF NOT EXISTS teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) DEFAULT 'forming' CHECK(status IN ('forming', 'active', 'disbanded')),
  generation_method VARCHAR(50) NOT NULL CHECK(generation_method IN ('manual', 'auto_basic', 'auto_advanced')),
  period VARCHAR(50) NOT NULL,
  created_by VARCHAR(50) NOT NULL,
  po_student_id VARCHAR(50) NOT NULL,
  required_skills JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  disbanded_at TIMESTAMP,
  diversity_score DECIMAL(4,3),
  skill_balance_score DECIMAL(4,3),
  sdg_alignment_score DECIMAL(4,3)
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
-- Purpose: Request dari mahasiswa untuk join tim (optional, untuk future use)
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
-- INDEXES STANDAR (Performa Relasi & Filter)
-- ==========================================

-- Pool entries indexes
CREATE INDEX IF NOT EXISTS idx_pool_entries_student_id ON pool_entries(student_id);
CREATE INDEX IF NOT EXISTS idx_pool_entries_period ON pool_entries(period);
CREATE INDEX IF NOT EXISTS idx_pool_entries_status ON pool_entries(status);
CREATE INDEX IF NOT EXISTS idx_pool_entries_program_studi ON pool_entries(program_studi);

-- Teams indexes
CREATE INDEX IF NOT EXISTS idx_teams_period ON teams(period);
CREATE INDEX IF NOT EXISTS idx_teams_status ON teams(status);
CREATE INDEX IF NOT EXISTS idx_teams_po_student_id ON teams(po_student_id);

-- Team members indexes
CREATE INDEX IF NOT EXISTS idx_team_members_team_id ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_student_id ON team_members(student_id);
CREATE INDEX IF NOT EXISTS idx_team_members_role_in_team ON team_members(role_in_team);

-- Team invites indexes
CREATE INDEX IF NOT EXISTS idx_team_invites_team_id ON team_invites(team_id);
CREATE INDEX IF NOT EXISTS idx_team_invites_invitee_student_id ON team_invites(invitee_student_id);
CREATE INDEX IF NOT EXISTS idx_team_invites_status ON team_invites(status);

-- Team join requests indexes
CREATE INDEX IF NOT EXISTS idx_team_join_requests_team_id ON team_join_requests(team_id);
CREATE INDEX IF NOT EXISTS idx_team_join_requests_requester_student_id ON team_join_requests(requester_student_id);
CREATE INDEX IF NOT EXISTS idx_team_join_requests_status ON team_join_requests(status);


-- ==========================================
-- GIN INDEXES (Super Cepat untuk JSONB & Array)
-- Mendukung Sistem Matching & Rekomendasi Level 2
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_pool_entries_skills ON pool_entries USING GIN (skills);
CREATE INDEX IF NOT EXISTS idx_teams_required_skills ON teams USING GIN (required_skills);
CREATE INDEX IF NOT EXISTS idx_pool_entries_sdg_topics ON pool_entries USING GIN (sdg_topics);