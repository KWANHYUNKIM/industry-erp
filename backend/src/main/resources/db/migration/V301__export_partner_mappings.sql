-- 원본 Invoice/Packing List [매핑조회](C000652, 2026-10-12 실측) — 거래처마다 마지막으로 저장한 인보이스 머리 칸을 기억했다가
-- 다음 인보이스에서 그 거래처를 고르면 채운다. 거래처 하나에 한 줄.
CREATE TABLE export_partner_mappings (
    id              bigserial PRIMARY KEY,
    partner_id      bigint NOT NULL REFERENCES business_partners(id),
    lc_bank         varchar(300),
    shipper         varchar(300),
    messrs          varchar(300),
    notify_party    varchar(300),
    port_of_loading varchar(100),
    destination     varchar(100),
    carrier         varchar(100),
    weight_unit     varchar(20),
    remark          varchar(300),
    created_at      timestamp(6),
    updated_at      timestamp(6),
    CONSTRAINT uk_export_partner_mappings_partner UNIQUE (partner_id)
);
