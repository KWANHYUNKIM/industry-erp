-- 전표 번호표: (번호 공간, 일자)별 마지막으로 준 일련번호. 지운다고 내리지 않는다 —
-- 원본(이카운트)은 지운 전표 번호를 다시 쓰지 않는다(-2 를 지우면 다음은 -3).
-- 번호 공간 = '테이블:접두어'(예 'sales:SO-'). 올리기는 DocumentNoGenerator.nextSeq 의
-- INSERT … ON CONFLICT DO UPDATE … RETURNING 한 문장(행 잠금으로 동시 저장도 겹치지 않음).
-- 기존 전표는 따로 백필하지 않는다: 그 문장이 GREATEST(last_no, 지금 남은 행의 max) + 1 로
-- 처음 한 번 따라잡는다(행이 없으면 max + 1 로 넣는다).
CREATE TABLE document_sequences (
    space    varchar(100) NOT NULL,
    seq_date date         NOT NULL,
    last_no  integer      NOT NULL,
    CONSTRAINT pk_document_sequences PRIMARY KEY (space, seq_date)
);
