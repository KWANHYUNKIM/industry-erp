-- 업무일지 [답글(F8)] · [답변] — 원본 E070304 '조회' 창은 글 아래에 '↳ 1 제목' 답글 카드를 단다(2026-10-12 loginaa 실측).
-- 답글이 달린 글은 지울 수 없다('답변이 있는 글은 삭제할 수 없습니다.') — 그래서 지울 때 같이 지우지 않는다.
ALTER TABLE work_journals ADD COLUMN parent_id bigint;
ALTER TABLE work_journals ADD CONSTRAINT fk_work_journals_parent_id FOREIGN KEY (parent_id) REFERENCES work_journals(id);
CREATE INDEX idx_work_journals_parent_id ON work_journals (parent_id);
