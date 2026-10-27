-- 사원등록 [우편번호] — 원본 사원(담당)등록의 주소 앞 칸(2026-10-04 실측). 일용근로 사원(daily_workers.zipcode)과 같은 꼴.
ALTER TABLE public.employees ADD COLUMN zipcode varchar(10);
