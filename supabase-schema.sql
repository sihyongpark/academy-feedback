-- =============================================
-- 학원 피드백 관리 시스템 - Supabase 스키마
-- Supabase 대시보드 → SQL Editor에서 실행
-- =============================================

-- 기존 테이블 삭제 (재실행 시)
drop table if exists records cascade;
drop table if exists students cascade;
drop table if exists classes cascade;
drop table if exists users cascade;

-- 사용자 테이블
create table users (
  id text primary key,
  name text not null,
  role text not null default 'teacher',
  password_hash text not null,
  created_at timestamptz default now()
);

-- 클래스 테이블
create table classes (
  id bigserial primary key,
  schedule text,
  teacher_ids text[] default '{}',
  subject text,
  color text,
  frequency text,
  created_at timestamptz default now()
);

-- 학생 테이블 (recipients, schedule_slots, teacher_ids, memo 추가)
create table students (
  id bigserial primary key,
  name text not null,
  grade text,
  phone text,
  subject text,
  parent_name text,
  class_id bigint references classes(id) on delete set null,
  recipients jsonb default '[]',
  schedule_slots jsonb default '[]',
  teacher_ids text[] default '{}',
  memo text default '',
  created_at timestamptz default now()
);

-- 수업 기록 테이블
create table records (
  id bigserial primary key,
  student_id bigint references students(id) on delete cascade,
  date text,
  subject text,
  progress text,
  homework text default '완료',
  score integer default 0,
  attitude text default '보통',
  note text default '',
  send_status text default '안함',
  sent_at text,
  sent_message text,
  created_at timestamptz default now()
);

-- =============================================
-- 초기 관리자 계정
-- 비밀번호: admin1234 (bcrypt 해시)
-- ⚠️ 배포 후 반드시 비밀번호 변경하세요!
-- =============================================
insert into users (id, name, role, password_hash) values
('admin', '관리자', 'admin', '$2b$10$rOzGBMgbKE8bJdW7Gz3M7.8gVqQkM2Zf6I5YxLOPh7N3KVeT9ZYWK');

-- RLS 비활성화 (서버사이드 service key 사용)
alter table users disable row level security;
alter table classes disable row level security;
alter table students disable row level security;
alter table records disable row level security;
