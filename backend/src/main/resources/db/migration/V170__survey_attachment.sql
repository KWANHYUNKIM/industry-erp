-- 설문조사의 첨부.
--
-- 원본 설문조사입력에 [여기에 파일 놓기]가 있다(사본 실측). 우리 화면 주석에는
-- "[첨부](파일 업로드가 이 화면에 아직 없다)" 고 적혀 있었다 — 이제 있다.
-- 업무게시판·기안서와 같은 방식이다(stored_files 를 가리킨다).
--
-- FK 컬럼 인덱스를 같이 만든다. PostgreSQL 은 자동으로 안 만든다(CLAUDE.md 7.1).

ALTER TABLE surveys ADD COLUMN attachment_id bigint;
ALTER TABLE surveys ADD CONSTRAINT fk_surveys_attachment
    FOREIGN KEY (attachment_id) REFERENCES stored_files (id);
CREATE INDEX idx_surveys_attachment ON surveys (attachment_id);
