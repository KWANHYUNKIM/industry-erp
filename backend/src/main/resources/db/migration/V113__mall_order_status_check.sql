-- 쇼핑몰 주문 상태 CHECK 제약을 배송/반품/교환까지 확장.
-- V70 이 만든 ck_mall_orders_status 는 RECEIVED/CONFIRMED/CONVERTED/CANCELLED 4개만 허용해
-- SHIPPED/RETURNED/EXCHANGED 저장이 런타임(insert/update)에서 23514 로 막혔다.
-- @Enumerated(STRING) 컬럼은 Hibernate validate 가 CHECK 를 검증하지 않아, 이 종류의 드리프트는
-- 마이그레이션으로 CHECK 를 함께 갱신해야 한다(enum CHECK 함정).
ALTER TABLE mall_orders DROP CONSTRAINT ck_mall_orders_status;
ALTER TABLE mall_orders ADD CONSTRAINT ck_mall_orders_status
    CHECK (status IN ('RECEIVED', 'CONFIRMED', 'CONVERTED', 'SHIPPED', 'RETURNED', 'EXCHANGED', 'CANCELLED'));
