-- 각종증명서인쇄(E020606): 원본은 증명서종류 '====' 를 그대로 저장한다(목록 '없음', 2026-10-14 실측).
ALTER TABLE public.hr_certificates ALTER COLUMN kind DROP NOT NULL;
