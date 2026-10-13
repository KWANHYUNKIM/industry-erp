-- 그룹웨어 칸반 두 게시판(2026-10-14 loginaa 실측 — .claude/skills/ecount-diff/plans/그룹웨어/E200190.md · E200072.md):
--   KANBAN_SAMPLE   업무관리 › 🔸 칸반보드 활용 예시 🔸 (E200190) — 목록이 칸반 판(열 = 진행상태)
--   PROJECT_KANBAN  공유정보 › 프로젝트 진행관리(예시) › 📅 프로젝트 진행현황 칸반 (E200072) — 글 View 본문이 칸반 판
-- 간판제작(SIGN) 입력 창 [프로젝트] · [칸반연결] — 진행현황 칸반 글의 판이 이 둘로 열(프로젝트) · 카드(이은 글)를 모은다.
ALTER TABLE work_posts DROP CONSTRAINT ck_work_posts_board;
ALTER TABLE work_posts ADD CONSTRAINT ck_work_posts_board CHECK (board IN ('WORK', 'NOTICE', 'SHARED', 'MEETING', 'SIGN', 'MINUTES', 'AI_GUIDE', 'SITE_LOG', 'SITE_STATUS', 'DEV_LOG', 'DEV_STATUS', 'CONSULT', 'VISIT', 'CONTRACT', 'AS_CARE', 'CAR_INFO', 'CAR_DOC', 'CAR_RUN', 'KANBAN_SAMPLE', 'PROJECT_KANBAN'));
ALTER TABLE work_post_labels DROP CONSTRAINT ck_work_post_labels_board;
ALTER TABLE work_post_labels ADD CONSTRAINT ck_work_post_labels_board CHECK (board IN ('WORK', 'NOTICE', 'SHARED', 'MEETING', 'SIGN', 'MINUTES', 'AI_GUIDE', 'SITE_LOG', 'SITE_STATUS', 'DEV_LOG', 'DEV_STATUS', 'CONSULT', 'VISIT', 'CONTRACT', 'AS_CARE', 'CAR_INFO', 'CAR_DOC', 'CAR_RUN', 'KANBAN_SAMPLE', 'PROJECT_KANBAN'));
ALTER TABLE work_posts ADD COLUMN project varchar(100);
-- 칸반 글을 지우면 이은 간판제작 글은 남고 연결만 끊긴다.
ALTER TABLE work_posts ADD COLUMN kanban_post_id bigint REFERENCES work_posts (id) ON DELETE SET NULL;
CREATE INDEX idx_work_posts_kanban_post_id ON work_posts (kanban_post_id);
