-- 휴가항목등록 [이월 휴가코드] — 이월 잔여일수 자동계산을 [사용]하면 어느 휴가항목의 잔여를 이월할지 고른다(원본 E020702 실측 2026-10-04).
ALTER TABLE public.vacation_kinds ADD COLUMN carry_from_id bigint;
ALTER TABLE public.vacation_kinds ADD CONSTRAINT fk_vacation_kinds_carry_from FOREIGN KEY (carry_from_id) REFERENCES public.vacation_kinds (id);
CREATE INDEX idx_vacation_kinds_carry_from ON public.vacation_kinds (carry_from_id);
