-- 원본 공지사항 · WORK 의 [라벨] › + → '라벨조회' 창 (2026-10-12 loginaa E200080 실측):
--  라벨코드 · 라벨명 · 색상(11색 × 7단 팔레트, 기본 검정) — 게시판마다 따로. 라벨수정에서 코드는 막힌다.
--  하단 [사용중단/재사용 ▲] 사용중단 · 삭제 · 재사용. 글에 붙는 라벨은 work_posts.labels 에 이름으로 남는다.
CREATE TABLE work_post_labels (
    id         bigserial    PRIMARY KEY,
    board      varchar(20)  NOT NULL,
    code       varchar(20)  NOT NULL,
    name       varchar(20)  NOT NULL,
    color      varchar(7)   NOT NULL,
    active     boolean      NOT NULL,
    created_at timestamp,
    updated_at timestamp,
    CONSTRAINT uq_work_post_labels_board_code UNIQUE (board, code),
    CONSTRAINT ck_work_post_labels_board CHECK (board IN ('WORK', 'NOTICE'))
);

-- 지금까지 글에 이름으로만 붙어 있던 라벨을 마스터로 옮긴다(색은 원본 기본값 검정, 코드는 이름 차례로 01 · 02 …).
INSERT INTO work_post_labels (board, code, name, color, active, created_at, updated_at)
SELECT board, lpad(row_number() OVER (PARTITION BY board ORDER BY name)::text, 2, '0'), name, '#000000', true, now(), now()
FROM (SELECT DISTINCT p.board, trim(l) AS name
        FROM work_posts p, regexp_split_to_table(p.labels, ',') AS l
       WHERE p.labels IS NOT NULL AND trim(l) <> '') s;
