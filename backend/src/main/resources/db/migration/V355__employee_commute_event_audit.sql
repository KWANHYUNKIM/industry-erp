-- 출/퇴근기록부(사원) 이력 한 줄의 [H] '출퇴근이력보기' — 최초입력시간 · 최종수정시간 옆의 [ 아이디 ](원본 2026-10-13 실측).
ALTER TABLE public.employee_commute_events ADD COLUMN created_by varchar(50);
ALTER TABLE public.employee_commute_events ADD COLUMN updated_by varchar(50);
