-- 출/퇴근기록부(ID) E070305 의 '출/퇴근기록부' 창(2026-10-14 loginaa 실측 — plans/그룹웨어/E070305.md):
-- 장소(처음 값 '사무실') · ☐외근 · 시간(시 · 분 고름) · ☐오전반차설정 · 사유. 사유는 예전부터 있던 note 칸에 든다.
-- 시각은 고른 값이 그대로 clock_in / clock_out 에 들고, 입력한 때는 created_at(지각현황(ID) '입력시간').
ALTER TABLE attendances ADD COLUMN place varchar(50);
ALTER TABLE attendances ADD COLUMN outside_work boolean NOT NULL DEFAULT false;
ALTER TABLE attendances ADD COLUMN half_leave boolean NOT NULL DEFAULT false;
