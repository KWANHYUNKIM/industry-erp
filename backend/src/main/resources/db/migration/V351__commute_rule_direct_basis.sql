-- 출/퇴근반영기준(원본 E020725) 직접설정 칸 · 시간단위 칸 + 근태항목(출/퇴근 유형)이 가리키는 반영기준.
-- 원본 2026-10-13 실측: 직접설정이면 기준시간(당일/익일 시:분 ~) · 오전반차설정(지각) / 오후반차설정(조퇴) + 사용 ·
-- 요일(월~금 기본) · 업무일/휴일(전체 · 업무일 · 휴일), 계산단위 시간이면 최대시간 · 반영단위가 더 보인다.
ALTER TABLE public.commute_rules ADD COLUMN base_from varchar(8);
ALTER TABLE public.commute_rules ADD COLUMN base_to varchar(8);
ALTER TABLE public.commute_rules ADD COLUMN half_from varchar(8);
ALTER TABLE public.commute_rules ADD COLUMN half_to varchar(8);
ALTER TABLE public.commute_rules ADD COLUMN half_use boolean NOT NULL DEFAULT false;
ALTER TABLE public.commute_rules ADD COLUMN weekdays varchar(7) NOT NULL DEFAULT '0111110';
ALTER TABLE public.commute_rules ADD COLUMN day_kind varchar(10) NOT NULL DEFAULT 'ALL';
ALTER TABLE public.commute_rules ADD CONSTRAINT ck_commute_rules_day_kind CHECK (day_kind IN ('ALL', 'WORKDAY', 'HOLIDAY'));
ALTER TABLE public.commute_rules ADD COLUMN max_hours integer;
ALTER TABLE public.commute_rules ADD COLUMN max_minutes integer;
ALTER TABLE public.commute_rules ADD COLUMN unit_hours integer;
ALTER TABLE public.commute_rules ADD COLUMN unit_minutes integer;

ALTER TABLE public.attendance_kinds ADD COLUMN commute_rule_id bigint;
ALTER TABLE public.attendance_kinds ADD CONSTRAINT fk_attendance_kinds_commute_rule
    FOREIGN KEY (commute_rule_id) REFERENCES public.commute_rules (id);
CREATE INDEX idx_attendance_kinds_commute_rule_id ON public.attendance_kinds (commute_rule_id);
