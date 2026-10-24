-- 회계1 결의서 격자 [추가정보] — 줄마다 부가세정보(부가세유형 · 발생일자 · 거래처 · 공급가액 · 부가세).
-- 2026-10-21 loginaa 지출결의서(E010408) 실측: 세금계산서 · (사)과학연구회 · 10,909 / 1,091 를 적용하면
-- 차) 복리후생비(판) 10,909 · 부가세대급금 1,091 / 대) 현금 12,000, 매입장에 그 거래처 · 공급가액 · 부가세로 선다.
ALTER TABLE fast_voucher_lines ADD COLUMN vat_type varchar(30);
ALTER TABLE fast_voucher_lines ADD COLUMN vat_date date;
ALTER TABLE fast_voucher_lines ADD COLUMN vat_partner_id bigint REFERENCES business_partners (id);
ALTER TABLE fast_voucher_lines ADD COLUMN vat_supply numeric(18, 2);
ALTER TABLE fast_voucher_lines ADD COLUMN vat_amount numeric(18, 2);
CREATE INDEX idx_fast_voucher_lines_vat_partner_id ON fast_voucher_lines (vat_partner_id);
