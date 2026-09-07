-- 게시글에 '게시판' 을 붙인다.
--
-- 원본은 게시판을 여러 개 두고 게시글을 그 아래 단다. 업무관리 > 업무관리게시판은 **묶음**이고
-- 그 안에 'WORK' 게시판이, 공유정보 > 게시판 아래에는 '공지사항' 이 있다. 두 게시판의
-- 게시글번호가 한 줄기로 이어지고 중간에 구멍이 있어서(공지사항에 5·4·2·1 — 3번은 다른 게시판 글)
-- 게시글 테이블이 하나라는 것을 알 수 있다. 그래서 우리도 한 테이블에 게시판 구분만 둔다.
ALTER TABLE work_posts ADD COLUMN board varchar(20) DEFAULT 'WORK' NOT NULL;
ALTER TABLE work_posts ADD CONSTRAINT ck_work_posts_board CHECK (board IN ('WORK', 'NOTICE'));
CREATE INDEX idx_work_posts_board ON work_posts (board, post_date DESC, id DESC);

-- notices 는 우리가 따로 만든 공지 테이블이었다. 원본에서 공지사항은 게시판 하나일 뿐이고
-- 화면 모양도 WORK 게시판과 똑같다. 두 모델을 유지할 이유가 없다.
-- 비어 있는 것을 확인하고 지운다(옮길 행이 없다).
DROP TABLE IF EXISTS notices;
