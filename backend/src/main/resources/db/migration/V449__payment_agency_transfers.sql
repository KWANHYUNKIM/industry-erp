-- 회계1 결제대행사등록(E010114) [이체정보] — 결제대행사마다 이체정보리스트(은행코드 · 은행 · 계좌번호 · 예금주명 · 적요1 · 적요2 · 기본).
-- 2026-10-21 loginaa 실측: 이체정보등록 창 은행명(은행코드 코드도움 003 → 기업은행) · 계좌번호(필수) · 예금주명 · 기본이체통장 ☐기본 · 적요1 · 적요2.
CREATE TABLE payment_agency_transfers (
    id bigserial PRIMARY KEY,
    payment_agency_id bigint NOT NULL REFERENCES payment_agencies (id) ON DELETE CASCADE,
    bank_code varchar(10),
    bank_name varchar(50),
    account_no varchar(50) NOT NULL,
    holder varchar(50),
    memo1 varchar(100),
    memo2 varchar(100),
    is_default boolean NOT NULL DEFAULT false
);
CREATE INDEX idx_payment_agency_transfers_payment_agency_id ON payment_agency_transfers (payment_agency_id);
