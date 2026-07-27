-- 쇼핑몰 주문 이행(배송/반품/교환) 컬럼.
-- status enum 은 CHECK 제약이 없어 SHIPPED/RETURNED/EXCHANGED 값 추가에 스키마 변경 불필요(컬럼 length 20 수용).
-- 여기서는 배송정보(택배사·송장·배송일)와 반품/교환 사유·최종처리일만 추가한다.
-- 재고·채권 반전은 판매전표(sales)가 소유 — 몰이 중복 기록하지 않는다(반품 재무처리는 판매 측 별개 트랙).
ALTER TABLE mall_orders ADD COLUMN courier      varchar(50);
ALTER TABLE mall_orders ADD COLUMN tracking_no  varchar(50);
ALTER TABLE mall_orders ADD COLUMN shipped_at   date;
ALTER TABLE mall_orders ADD COLUMN close_reason varchar(300);
ALTER TABLE mall_orders ADD COLUMN closed_at    date;
