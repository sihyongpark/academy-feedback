-- students 테이블에 새 컬럼 추가
ALTER TABLE students ADD COLUMN IF NOT EXISTS student_phone text DEFAULT '';
ALTER TABLE students ADD COLUMN IF NOT EXISTS gender text DEFAULT '';
ALTER TABLE students ADD COLUMN IF NOT EXISTS school text DEFAULT '';
ALTER TABLE students ADD COLUMN IF NOT EXISTS status text DEFAULT '재원';

-- settings 테이블 생성 (문자 가이드라인 등)
CREATE TABLE IF NOT EXISTS settings (
  key text PRIMARY KEY,
  value text,
  updated_at timestamp with time zone DEFAULT timezone('utc', now())
);
