-- 부가세신고서(일반) [신고서등] 창의 신고서 · 첨부서류 한 장씩 — 원본은 [조회] 때 만든 숫자를 저장해 두고, 전표가 바뀌어도
-- [새로불러오기] 전까지 그 숫자를 보여 준다(2026-10-13 loginaa: 카드매출을 넣은 뒤 신고서 조회 [취소] → (3) 0 그대로).
-- 첨부서류를 신고서보다 늦게 고치면 창 머리에 '부가세신고서 최종수정일 … 이후로 수정된 서류가 있습니다.' — written_at 으로 견준다.
CREATE TABLE vat_return_docs (
    id            bigserial PRIMARY KEY,
    vat_return_id bigint      NOT NULL REFERENCES vat_returns (id) ON DELETE CASCADE,
    doc_code      varchar(30) NOT NULL,
    data          text        NOT NULL,
    written_at    timestamp(6) NOT NULL,
    created_at    timestamp(6),
    updated_at    timestamp(6),
    CONSTRAINT uk_vat_return_docs UNIQUE (vat_return_id, doc_code)
);
