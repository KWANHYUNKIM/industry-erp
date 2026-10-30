-- 업무관리 게시판 답글(하위 글) — 원본 🚗 2. 차량 증빙관리 · 🎧 상담 이력관리 목록은 글 제목 뒤에 '[1]'(답글 수)을 달고
-- [모두펼쳐보기] 로 그 아래 하위 글을 편다(2026-10-30 loginaa 실측). 답글은 원글 하나에만 달린다(한 단).
-- 답글이 달린 글은 지울 수 없다(업무일지 E070304 와 같은 규칙) — 그래서 지울 때 같이 지우지 않는다.
ALTER TABLE work_posts ADD COLUMN parent_id bigint;
ALTER TABLE work_posts ADD CONSTRAINT fk_work_posts_parent_id FOREIGN KEY (parent_id) REFERENCES work_posts(id);
CREATE INDEX idx_work_posts_parent_id ON work_posts (parent_id);
