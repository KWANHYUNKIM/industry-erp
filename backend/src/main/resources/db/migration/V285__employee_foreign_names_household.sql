-- 사원등록 [외국어성명2] · [외국어성명1] · [세대주여부](세대주 · 세대원 · 세대주의 배우자) — 원본 성명 아래 칸들(2026-10-04 실측).
ALTER TABLE public.employees ADD COLUMN foreign_name1 varchar(100);
ALTER TABLE public.employees ADD COLUMN foreign_name2 varchar(100);
ALTER TABLE public.employees ADD COLUMN household varchar(20);
