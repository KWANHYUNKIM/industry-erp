-- V5: sales_orders → order_stages / order_types 관계 연결
--
-- 배경: 오더 진행단계·오더 유형 마스터는 관리 화면(이카운트 '오더관리진행단계',
--       '오더관리유형리스트')까지 완성돼 있는데, 정작 수주(sales_orders)가
--       이 둘을 참조하지 않아 마스터가 고립돼 있었다.
--
-- nullable 로 둔다: 단계/유형 미지정 수주를 허용한다(기존 행 + 이카운트 동작과 일치).
-- 마스터는 참조되는 쪽이므로 삭제는 RESTRICT — active=false 소프트 삭제를 쓴다.

ALTER TABLE sales_orders ADD COLUMN stage_id      bigint;
ALTER TABLE sales_orders ADD COLUMN order_type_id bigint;

ALTER TABLE sales_orders
    ADD CONSTRAINT fk_sales_orders_stage
        FOREIGN KEY (stage_id) REFERENCES order_stages (id) ON DELETE RESTRICT;

ALTER TABLE sales_orders
    ADD CONSTRAINT fk_sales_orders_order_type
        FOREIGN KEY (order_type_id) REFERENCES order_types (id) ON DELETE RESTRICT;

-- FK 컬럼에는 인덱스를 직접 만들어야 한다 (Postgres 는 자동 생성하지 않는다).
CREATE INDEX idx_sales_orders_stage_id      ON sales_orders (stage_id);
CREATE INDEX idx_sales_orders_order_type_id ON sales_orders (order_type_id);
