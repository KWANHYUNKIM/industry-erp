-- (본사 V499 와 같다)
-- 계좌 · 카드 · 카드사를 거래처 코드도움에서 고르게(원본은 거래처와 한 이름공간 — 2026-10-29 데이터이관 QA 루프 70~72).
-- 짝 거래처(business_partners.linked_kind)를 두고 계좌 · 카드 · 카드사가 partner_id 로 가리킨다.
ALTER TABLE business_partners ADD COLUMN linked_kind varchar(20);

ALTER TABLE bank_accounts ADD COLUMN partner_id bigint REFERENCES business_partners(id);
CREATE INDEX idx_bank_accounts_partner_id ON bank_accounts(partner_id);
ALTER TABLE credit_cards ADD COLUMN partner_id bigint REFERENCES business_partners(id);
CREATE INDEX idx_credit_cards_partner_id ON credit_cards(partner_id);
ALTER TABLE card_issuers ADD COLUMN partner_id bigint REFERENCES business_partners(id);
CREATE INDEX idx_card_issuers_partner_id ON card_issuers(partner_id);

-- 이미 있는 계좌 · 카드 · 카드사의 짝. 같은 코드의 거래처가 이미 있으면 만들지 않는다(그 코드는 거래처가 쓴다).
INSERT INTO business_partners (code, name, type, active, reg_no_kind, industry_kind, tax_report, shipment_target, credit_limit,
                               foreign_currency, ar_no_managed, ap_no_managed, search_keyword, linked_kind, created_at, updated_at)
SELECT DISTINCT ON (k.code) k.code, k.name, 'BOTH', k.active, '사업자등록번호', '일반', false, false, 0, false, false, false, k.kw, 'BANK', now(), now()
FROM (SELECT coalesce(nullif(code, ''), account_no) AS code,
             coalesce(nullif(name, ''), trim(bank_name || ' ' || account_no)) AS name, active, search_text AS kw
      FROM bank_accounts) k
WHERE NOT EXISTS (SELECT 1 FROM business_partners p WHERE p.code = k.code)
ORDER BY k.code;
UPDATE bank_accounts b SET partner_id = p.id FROM business_partners p
WHERE p.linked_kind = 'BANK' AND p.code = coalesce(nullif(b.code, ''), b.account_no);

INSERT INTO business_partners (code, name, type, active, reg_no_kind, industry_kind, tax_report, shipment_target, credit_limit,
                               foreign_currency, ar_no_managed, ap_no_managed, search_keyword, linked_kind, created_at, updated_at)
SELECT DISTINCT ON (k.code) k.code, k.name, 'BOTH', k.active, '사업자등록번호', '일반', false, false, 0, false, false, false, k.kw, 'CARD', now(), now()
FROM (SELECT coalesce(nullif(code, ''), card_no) AS code, coalesce(nullif(card_name, ''), card_no) AS name, active, search_text AS kw
      FROM credit_cards) k
WHERE NOT EXISTS (SELECT 1 FROM business_partners p WHERE p.code = k.code)
ORDER BY k.code;
UPDATE credit_cards c SET partner_id = p.id FROM business_partners p
WHERE p.linked_kind = 'CARD' AND p.code = coalesce(nullif(c.code, ''), c.card_no);

INSERT INTO business_partners (code, name, type, active, reg_no_kind, industry_kind, tax_report, shipment_target, credit_limit,
                               foreign_currency, ar_no_managed, ap_no_managed, search_keyword, linked_kind, created_at, updated_at)
SELECT DISTINCT ON (i.code) i.code, i.name, 'BOTH', i.active, '사업자등록번호', '일반', false, false, 0, false, false, false, i.search_keyword, 'CARD_ISSUER', now(), now()
FROM card_issuers i
WHERE NOT EXISTS (SELECT 1 FROM business_partners p WHERE p.code = i.code)
ORDER BY i.code;
UPDATE card_issuers i SET partner_id = p.id FROM business_partners p
WHERE p.linked_kind = 'CARD_ISSUER' AND p.code = i.code;
