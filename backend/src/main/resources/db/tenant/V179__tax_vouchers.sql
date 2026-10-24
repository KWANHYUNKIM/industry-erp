-- 세무 > 부가세 > 신고전검토자료 > (세금)계산서발행/수령 — 원본 C000068 [매출(세금)계산서] · [매입(세금)계산서] 창(2026-10-12 loginaa 실측).
-- 전표일자 · 부가세유형 · 거래처 · 공급가액 · 부가세 · 비고. 회계전표와 따로 도는 부가세 신고용 자료다 —
-- 원본에서 저장해도 분개장에 줄이 생기지 않았고, 매출(세금)계산서조회(세무)에만 [내역보기] '세무' 로 떴다.
CREATE TABLE tax_vouchers (
    id             bigserial PRIMARY KEY,
    side           varchar(10) NOT NULL CHECK (side IN ('SALES', 'PURCHASE')),
    entry_date     date NOT NULL,
    entry_no       integer NOT NULL,
    vat_type       varchar(30) NOT NULL,
    partner_id     bigint NOT NULL REFERENCES business_partners(id),
    supply_amount  numeric(18,2) NOT NULL,
    vat_amount     numeric(18,2) NOT NULL,
    remark         varchar(300),
    created_by     varchar(50),
    updated_by     varchar(50),
    created_at     timestamp(6),
    updated_at     timestamp(6),
    CONSTRAINT uk_tax_vouchers_date_no UNIQUE (entry_date, entry_no)
);
CREATE INDEX idx_tax_vouchers_partner_id ON tax_vouchers (partner_id);
