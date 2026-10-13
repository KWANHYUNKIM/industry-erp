-- 원본 시리얼/로트No.내역조회(E040618) [신규(F2)] = '시리얼/로트No.내역입력' 창(2026-10-12 loginaa 실측):
--  일자 · 전표구분(견적 · 주문 · 판매 · … · Invoice/Packing List) · 창고 · 품목코드 · 수량 · 시리얼/로트No. · 거래처 ·
--  관리항목 · 담당자 · 프로젝트 · 적요. 전표 없이 손으로 넣은 줄이라 [연결전표-No.] 가 비고, 선택삭제로 지운다.
--  manual 은 그 줄인지(전표가 남긴 줄은 그 전표에서만 고치고 지운다), 나머지는 창의 칸이다.
ALTER TABLE lot_transactions ADD COLUMN manual boolean;
UPDATE lot_transactions SET manual = false WHERE manual IS NULL;
ALTER TABLE lot_transactions ALTER COLUMN manual SET NOT NULL;
ALTER TABLE lot_transactions ALTER COLUMN manual SET DEFAULT false;
ALTER TABLE lot_transactions ADD COLUMN warehouse_id bigint REFERENCES warehouses (id);
ALTER TABLE lot_transactions ADD COLUMN project_id bigint REFERENCES projects (id);
ALTER TABLE lot_transactions ADD COLUMN charge_name varchar(50);
ALTER TABLE lot_transactions ADD COLUMN mgmt_name varchar(100);
CREATE INDEX idx_lot_transactions_warehouse ON lot_transactions (warehouse_id);
CREATE INDEX idx_lot_transactions_project ON lot_transactions (project_id);
