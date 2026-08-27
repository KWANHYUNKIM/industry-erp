-- 업무관리게시판의 첨부와 조회수.
--
-- 원본 WORK 격자의 열은 일자-No. · 게시글번호 · 제목 · 작성자명 · 전달자 · 진행상태 ·
-- <b>첨부 · 조회</b> 다. 상세를 펼치면 파일이 이름·크기와 함께 붙어 있다
-- (사본: '연천 숙박 영수증.jpg (822.8KB)').
--
-- 우리는 두 열을 만들어 두고 <b>채우지 못했다.</b> 첨부 칸은 늘 비어 있었고(그 자리에
-- "아직 업무글에 붙일 수 없다" 는 주석이 있었다), 조회 칸에는 완료/재개 버튼이 들어가
-- 있어서 열 이름과 내용이 어긋났다. 열은 있는데 아무 일도 안 하는 칸이 둘이었다.
--
-- 첨부는 기안서와 같은 방식이다 — stored_files 를 가리킨다.
-- FK 컬럼 인덱스를 같이 만든다. PostgreSQL 은 자동으로 안 만든다(CLAUDE.md 7.1).

ALTER TABLE work_posts ADD COLUMN attachment_id bigint;
ALTER TABLE work_posts ADD CONSTRAINT fk_work_posts_attachment
    FOREIGN KEY (attachment_id) REFERENCES stored_files (id);
CREATE INDEX idx_work_posts_attachment ON work_posts (attachment_id);

ALTER TABLE work_posts ADD COLUMN view_count integer;
UPDATE work_posts SET view_count = 0 WHERE view_count IS NULL;
ALTER TABLE work_posts ALTER COLUMN view_count SET NOT NULL;
