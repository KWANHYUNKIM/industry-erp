-- 부가세신고서(일반) 목록의 [이력] — 원본 '부가세신고서 이력보기' 창(순번 · 작업자ID · 작업일시 · 신고서종류 · 행위, 2026-10-20 loginaa 실측).
-- 원본은 신고서 정보를 만들면 '2026년 2기 예정(7~9)-(주)가장많이쓰는ERP · 신규', 서류를 처음 만들면 '매출세금계산서 · 신규',
-- [새로불러오기] 하면 같은 서류가 '삭제' 다음 '신규' 로 남는다. doc_code 는 vat_return_docs 와 같은 글자(INFO 는 신고서 정보).
-- 신고서를 지우면 이력도 같이 지운다. FK 컬럼에는 인덱스를 직접 만든다(CLAUDE.md 7.1).
CREATE TABLE vat_return_histories (
    id            bigserial    PRIMARY KEY,
    vat_return_id bigint       NOT NULL,
    changed_at    timestamp    NOT NULL,
    changed_by    varchar(50),
    doc_code      varchar(30)  NOT NULL,
    action        varchar(10)  NOT NULL,
    CONSTRAINT fk_vat_return_histories_return FOREIGN KEY (vat_return_id)
        REFERENCES vat_returns(id) ON DELETE CASCADE
);
CREATE INDEX idx_vat_return_histories_return ON vat_return_histories(vat_return_id);
