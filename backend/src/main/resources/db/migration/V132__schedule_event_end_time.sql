-- 일정관리 목록의 '종료시간' 칸. 원본(E070201)은 시작시간과 종료시간을 나란히 보여준다.
-- 기존 일정에는 종료시간이 없으므로 nullable 로 둔다(종일/무기한 일정도 그대로 표현된다).
ALTER TABLE schedule_events ADD COLUMN end_time varchar(10);
