-- (본사 V380 과 같다) 그룹웨어 > 공유정보 의 게시판 셋을 더한다(2026-10-13 loginaa 사이트맵 실측).
--   SHARED  · 통합게시판 > 공유정보/업무관리 게시판 20개까지 (E0725xx 꼴 — 번호 · 작성자 · 완료일, 번호는 이 게시판 혼자 센다)
--   MEETING · 회의록(예시) > 팀별회의록 게시판 (E200068 — 진행상태 자리가 '부서구분')
--   SIGN    · 프로젝트 진행관리(예시) > 간판제작 프로젝트관리 (E072501 — 진행상태 수주견적 · 디자인팀 시안 · 자재발주, 제작 · 현장시공)
-- 진행상태 이름은 게시판마다 회사가 정한다. WORK 의 진행중/완료(status)와 따로, 그 이름을 stage 에 적는다.
ALTER TABLE work_posts DROP CONSTRAINT ck_work_posts_board;
ALTER TABLE work_posts ADD CONSTRAINT ck_work_posts_board CHECK (board IN ('WORK', 'NOTICE', 'SHARED', 'MEETING', 'SIGN'));
ALTER TABLE work_post_labels DROP CONSTRAINT ck_work_post_labels_board;
ALTER TABLE work_post_labels ADD CONSTRAINT ck_work_post_labels_board CHECK (board IN ('WORK', 'NOTICE', 'SHARED', 'MEETING', 'SIGN'));
ALTER TABLE work_posts ADD COLUMN stage varchar(40);
