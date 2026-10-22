-- 판매입력 II 로 만든 판매 표시(원본 수정 창 '판매입력 II(수정)' · 판매현황 [판매구분] 판매 / 판매 II).
-- 이미 있는 판매 중 금액조정(할인)이 든 것은 판매입력 II 로만 만들 수 있었으므로 II 로 채운다.
ALTER TABLE sales ADD COLUMN input_ii boolean NOT NULL DEFAULT false;
UPDATE sales SET input_ii = true WHERE discount_supply <> 0 OR discount_vat <> 0;
