-- 사원등록 [입사구분](원본 코드도움 100 신입 · 200 경력) — 인원현황 [입사구분] 조건이 이 값을 본다.
ALTER TABLE public.employees ADD COLUMN hire_kind varchar(20);
