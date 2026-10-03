-- 원본 시리얼/로트No.내역조회(E040618): 한 줄은 구매 · 판매 같은 전표의 시리얼/로트 줄이고
-- [전표구분] · [연결전표-No.] 를 찍는다. 그 전표에서 만든 줄은 그 전표에서만 고치고 지운다.
ALTER TABLE lot_transactions ADD COLUMN doc_type varchar(30);
ALTER TABLE lot_transactions ADD COLUMN source_id bigint;
ALTER TABLE lot_transactions ADD COLUMN source_no varchar(40);
ALTER TABLE lot_transactions ADD COLUMN partner_name varchar(100);
CREATE INDEX idx_lot_transactions_source ON lot_transactions (doc_type, source_id);
