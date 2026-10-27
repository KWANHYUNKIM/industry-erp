-- 그룹웨어 > 업무관리 의 예시 게시판 열둘(2026-10-14 loginaa 사이트맵 · 목록 · 입력 창 실측).
-- 원본은 회사가 '게시판 설정' 으로 만든 게시판이라 틀은 같고 격자 열 · 입력항목만 다르다:
--   AI_GUIDE     🔹 이카운트 AI 활용 예시 🔹 (E200188)   SITE_LOG   🏗️ 현장공사일지 (E200176)   SITE_STATUS 📊 공사진행현황 (E200178)
--   DEV_LOG      📅 개발업무일지 (E200174)              DEV_STATUS 📈 개발진행현황 (E200186)
--   CONSULT · VISIT · CONTRACT · AS_CARE  계약관리 게시판(예시) 🎧 · 🤝🏻 · 📑 · 🛠️ (E200166 · E200168 · E200170 · E200184)
--   CAR_INFO · CAR_DOC · CAR_RUN          차량관리 게시판(예시) 🚗 1 · 2 · 3 (E200172 · E200180 · E200182)
--   extra_fields · 게시판마다 다른 입력항목(차량번호 · 출고일자 · 수리요청일 · 거래처 …) — 이름:값 JSON 한 덩이
ALTER TABLE work_posts DROP CONSTRAINT ck_work_posts_board;
ALTER TABLE work_posts ADD CONSTRAINT ck_work_posts_board CHECK (board IN ('WORK', 'NOTICE', 'SHARED', 'MEETING', 'SIGN', 'MINUTES', 'AI_GUIDE', 'SITE_LOG', 'SITE_STATUS', 'DEV_LOG', 'DEV_STATUS', 'CONSULT', 'VISIT', 'CONTRACT', 'AS_CARE', 'CAR_INFO', 'CAR_DOC', 'CAR_RUN'));
ALTER TABLE work_post_labels DROP CONSTRAINT ck_work_post_labels_board;
ALTER TABLE work_post_labels ADD CONSTRAINT ck_work_post_labels_board CHECK (board IN ('WORK', 'NOTICE', 'SHARED', 'MEETING', 'SIGN', 'MINUTES', 'AI_GUIDE', 'SITE_LOG', 'SITE_STATUS', 'DEV_LOG', 'DEV_STATUS', 'CONSULT', 'VISIT', 'CONTRACT', 'AS_CARE', 'CAR_INFO', 'CAR_DOC', 'CAR_RUN'));
ALTER TABLE work_posts ADD COLUMN extra_fields varchar(2000);
