-- 일정(schedule_events)에 장소·참석자 추가. 사내관리(C000698) 일정 검색/관리에서 쓰는 필드.
-- 기존 행은 NULL 로 남으며 기존 일정관리 동작에 영향 없음.
ALTER TABLE schedule_events ADD COLUMN location  varchar(200);
ALTER TABLE schedule_events ADD COLUMN attendees varchar(500);
