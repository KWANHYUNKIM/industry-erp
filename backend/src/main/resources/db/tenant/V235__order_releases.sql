-- 주문서출고처리(원본 E040230, 2026-10-13 loginaa 실측): 주문 줄의 잔량 중 고른 수량을 [출고] 로 '처리' 해 두고,
-- 처리 탭에서 그 건으로 판매입력을 한다. 잔량 = 주문수량 − 출고처리 수량(판매와 따로 센다 — 처리취소하면 판매가 남아도 잔량이 돌아온다).
CREATE TABLE order_releases (
    id             bigserial PRIMARY KEY,
    release_no     varchar(30)  NOT NULL UNIQUE,
    release_date   date         NOT NULL,
    sales_order_id bigint       NOT NULL REFERENCES sales_orders (id),
    sale_id        bigint       REFERENCES sales (id) ON DELETE SET NULL,
    created_by     varchar(50),
    created_at     timestamp,
    updated_at     timestamp
);
CREATE INDEX idx_order_releases_sales_order_id ON order_releases (sales_order_id);
CREATE INDEX idx_order_releases_sale_id ON order_releases (sale_id);
CREATE INDEX idx_order_releases_release_date ON order_releases (release_date);

CREATE TABLE order_release_lines (
    id                  bigserial PRIMARY KEY,
    order_release_id    bigint        NOT NULL REFERENCES order_releases (id),
    sales_order_line_id bigint        NOT NULL REFERENCES sales_order_lines (id),
    quantity            numeric(18,2) NOT NULL
);
CREATE INDEX idx_order_release_lines_order_release_id ON order_release_lines (order_release_id);
CREATE INDEX idx_order_release_lines_sales_order_line_id ON order_release_lines (sales_order_line_id);
