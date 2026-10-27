-- 각종구분값변경(세무 › 부가세 › 신고전검토자료 E010723) — 세금계산서(부가세 줄이 든 회계전표)마다 원본이 바꾸는 구분값(2026-10-04 실측).
-- doc_kind: 전자세금계산서 칸(종이(세금)계산서 · 전자(세금)계산서 · 수정 사유 여섯), progress: 진행상태(발행 안됨 · 기한후 발행 · 타발행).
-- 줄이 없으면 전자(세금)계산서 · 발행 안됨이다. 부가세신고서가 종이/전자 · 기한후 발행을 이것으로 가른다.
CREATE TABLE vat_invoice_marks (
    journal_entry_id bigint      PRIMARY KEY REFERENCES journal_entries (id) ON DELETE CASCADE,
    doc_kind         varchar(20) NOT NULL CHECK (doc_kind IN ('PAPER', 'ELECTRONIC', 'MODIFY_ERROR', 'MODIFY_AMOUNT',
                                                              'MODIFY_RETURN', 'MODIFY_CANCEL', 'MODIFY_LC', 'MODIFY_DUPLICATE')),
    progress         varchar(10) NOT NULL CHECK (progress IN ('NONE', 'LATE', 'ELSEWHERE')),
    created_at       timestamp,
    updated_at       timestamp
);
