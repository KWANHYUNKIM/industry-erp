-- (본사 V383 과 같다)
-- 그룹웨어 > 공유정보 > 회의록(예시) > 통합회의록 (E200066, 2026-10-13 loginaa 직접 등록 · 수정 · 삭제).
-- 팀별회의록 게시판(MEETING) 글을 부서마다 한 칸씩 잇는 게시판이다 — 격자 머리 '경영지원팀 회의록 · 구매팀 회의록 ·
-- 생산팀 회의록 · 영업팀 회의록 · 주 차'. 진행상태는 WORK 처럼 진행중 · 완료(status).
--   week_no       · 입력 창 [주 차 구분] (주차검색 1 1주차 ~ 5 5주차)
--   meeting_links · 부서 칸마다 이은 팀별회의록 글 id, 칸 차례대로 쉼표로 잇는다(빈 칸은 빈 글자) — '12,,,15'
ALTER TABLE work_posts DROP CONSTRAINT ck_work_posts_board;
ALTER TABLE work_posts ADD CONSTRAINT ck_work_posts_board CHECK (board IN ('WORK', 'NOTICE', 'SHARED', 'MEETING', 'SIGN', 'MINUTES'));
ALTER TABLE work_post_labels DROP CONSTRAINT ck_work_post_labels_board;
ALTER TABLE work_post_labels ADD CONSTRAINT ck_work_post_labels_board CHECK (board IN ('WORK', 'NOTICE', 'SHARED', 'MEETING', 'SIGN', 'MINUTES'));
ALTER TABLE work_posts ADD COLUMN week_no smallint;
ALTER TABLE work_posts ADD CONSTRAINT ck_work_posts_week_no CHECK (week_no BETWEEN 1 AND 5);
ALTER TABLE work_posts ADD COLUMN meeting_links varchar(100);
