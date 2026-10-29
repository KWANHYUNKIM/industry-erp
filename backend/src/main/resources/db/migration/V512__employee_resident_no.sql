-- 관리 › 사원등록 [주민등록번호] — 원본 기본 탭 성명 아래 칸(필수 아님, 묶음 U 2026-10-29). 생년월일 · 여권번호는 인사카드 곁 자료(employee_profiles)에 이미 있다.
ALTER TABLE employees ADD COLUMN resident_no varchar(20);
