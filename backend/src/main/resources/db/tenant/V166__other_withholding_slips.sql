-- 기타원천세입력(E030314)을 원본처럼 전표 한 장 · 여러 줄로(2026-10-04 loginaa 실측).
-- 원본 전표번호는 '지급일자-순번'(2025/07/31-2) 이고 한 장에 소득자가 여러 줄 든다. 머리에 지급일자 · 귀속연월 · 지급연월 ·
-- 소득구분, 줄마다 소득자(소득자등록) · 업종구분코드/업종명 또는 소득코드 · 필요경비율 · 세율. 있던 행은 한 줄짜리 전표로 옮긴다.
ALTER TABLE other_withholdings ADD COLUMN slip_seq integer;
ALTER TABLE other_withholdings ADD COLUMN line_no integer;
ALTER TABLE other_withholdings ADD COLUMN pay_month varchar(7);
ALTER TABLE other_withholdings ADD COLUMN payee_id bigint;
ALTER TABLE other_withholdings ADD COLUMN industry_name varchar(50);
ALTER TABLE other_withholdings ADD COLUMN expense_rate numeric(5, 2);
ALTER TABLE other_withholdings ADD COLUMN tax_rate numeric(5, 2);

UPDATE other_withholdings w SET slip_seq = s.seq
FROM (SELECT id, row_number() OVER (PARTITION BY pay_date ORDER BY id) AS seq FROM other_withholdings) s
WHERE w.id = s.id;
UPDATE other_withholdings SET line_no = 1, pay_month = to_char(pay_date, 'YYYY-MM');
-- 세율 · 필요경비율은 적혀 있던 금액에서 되짚는다(세액은 10원 미만을 버렸으므로 반올림).
UPDATE other_withholdings SET tax_rate = CASE
    WHEN taxable_amount > 0 THEN round(income_tax * 100 / taxable_amount)
    WHEN income_type = 'BUSINESS' THEN 3 WHEN income_type = 'OTHER' THEN 20 ELSE 14 END;
UPDATE other_withholdings SET expense_rate = CASE WHEN gross_amount > 0 THEN round(expense_amount * 100 / gross_amount) ELSE 0 END
WHERE income_type = 'OTHER';

ALTER TABLE other_withholdings ALTER COLUMN slip_seq SET NOT NULL;
ALTER TABLE other_withholdings ALTER COLUMN line_no SET NOT NULL;
ALTER TABLE other_withholdings ALTER COLUMN pay_month SET NOT NULL;
ALTER TABLE other_withholdings ALTER COLUMN tax_rate SET NOT NULL;
-- 원본에는 소득자가 비어 있는 줄이 있다(현황에만 보이고 조회 · 집계에서는 빠진다).
ALTER TABLE other_withholdings ALTER COLUMN payee_name DROP NOT NULL;
ALTER TABLE other_withholdings ADD CONSTRAINT uk_other_withholdings_slip_line UNIQUE (pay_date, slip_seq, line_no);
ALTER TABLE other_withholdings ADD CONSTRAINT fk_other_withholdings_payee_id
    FOREIGN KEY (payee_id) REFERENCES withholding_payees (id);
CREATE INDEX idx_other_withholdings_payee_id ON other_withholdings (payee_id);
