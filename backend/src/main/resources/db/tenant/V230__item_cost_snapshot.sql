-- 원가생성/수정(E040802) [수량비교] · [전월금액비교] · [이력] — 원가를 계산한 때의 기초수량 · 그 달 구매수량/금액 · 계산한 사람/때를 남긴다.
-- 원본 [수량비교](재고수량 Checklist)는 장부 기초수량과 '월별원가 기초수량'을, [전월금액비교](금액비교 Checklist)는
-- 지금 전월 구매와 '이전 월별원가 구매'를 견준다. 계산한 때의 값을 남겨 두지 않으면 견줄 것이 없다.
ALTER TABLE item_costs ADD COLUMN opening_qty numeric(18, 2);
ALTER TABLE item_costs ADD COLUMN purchase_qty numeric(18, 2);
ALTER TABLE item_costs ADD COLUMN purchase_amount numeric(18, 2);
ALTER TABLE item_costs ADD COLUMN calc_by varchar(50);
ALTER TABLE item_costs ADD COLUMN calc_at timestamp;
