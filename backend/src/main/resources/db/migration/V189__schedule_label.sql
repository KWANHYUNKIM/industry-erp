-- 일정관리의 [라벨]. 원본 일정관리 조건: 기준일자 · 참석자 · 제목 · 장소 · 일정구분 ·
-- <b>라벨</b> · 기타 · 본문.
--
-- 라벨은 <b>[일정구분]과 다른 축</b>이다 — 구분은 '회의·출장' 처럼 일정의 갈래이고,
-- 라벨은 '급함·대외비' 처럼 <b>가로지르는 표시</b>다. 공용품(supply_usages.label_text)이
-- 이미 같은 것을 들고 있어 이름과 길이를 맞춘다.
alter table schedule_events add column label_text varchar(100);
