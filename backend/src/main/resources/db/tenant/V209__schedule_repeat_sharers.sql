-- 원본 일정관리등록(E070201, 2026-10-13 loginaa 실측)의 [공유자] · [권한] · [반복설정].
--  공유자: 선택(사용자검색) / 전체. 권한(게시글권한): 참석자 · 공유자 수정/삭제(기본 켬), 이외사용자 조회(기본 끔).
--  반복설정: 반복주기 N 일/주/개월/년 … 종료 날짜/횟수 → 날마다 한 줄씩 펼쳐 넣고 repeat_group 으로 묶는다.
--  repeat_rule 은 원본 요약보기 글('매일, 2026/10/13 부터 3회 까지')로, 창의 [반복설정] 자리에 그대로 선다.
ALTER TABLE schedule_events ADD COLUMN sharers varchar(500);
ALTER TABLE schedule_events ADD COLUMN repeat_group varchar(40);
ALTER TABLE schedule_events ADD COLUMN repeat_rule varchar(200);
ALTER TABLE schedule_events ADD COLUMN perm_attendee_edit boolean;
ALTER TABLE schedule_events ADD COLUMN perm_sharer_edit boolean;
ALTER TABLE schedule_events ADD COLUMN perm_others_view boolean;
UPDATE schedule_events SET perm_attendee_edit = true, perm_sharer_edit = true, perm_others_view = false;
ALTER TABLE schedule_events ALTER COLUMN perm_attendee_edit SET NOT NULL;
ALTER TABLE schedule_events ALTER COLUMN perm_sharer_edit SET NOT NULL;
ALTER TABLE schedule_events ALTER COLUMN perm_others_view SET NOT NULL;
ALTER TABLE schedule_events ALTER COLUMN perm_attendee_edit SET DEFAULT true;
ALTER TABLE schedule_events ALTER COLUMN perm_sharer_edit SET DEFAULT true;
ALTER TABLE schedule_events ALTER COLUMN perm_others_view SET DEFAULT false;
CREATE INDEX idx_schedule_events_repeat_group ON schedule_events (repeat_group);
