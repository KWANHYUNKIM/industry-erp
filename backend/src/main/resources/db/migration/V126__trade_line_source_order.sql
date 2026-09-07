-- 판매·구매 명세 라인에 "불러온 근거전표"를 붙인다.
-- 이카운트 판매입력(ESD006M)·구매입력(ESG009M) 그리드의 [불러온 전표 / 전표일자 / 전표No.] 3열이
-- 가리키는 대상이며, 우리는 전표일자·전표No. 를 따로 저장하지 않고 근거전표를 FK 로 묶어 조인해서 낸다.
--
-- 지금까지는 라인 적요에 "SO-2026-0001 불러옴" 이라고 적어 두었다. 문자열은 검색·집계가 안 되고
-- 근거전표가 지워져도 그대로 남아 실제와 어긋난다.
--
-- 선택 입력이라 nullable 이다(직접 입력한 줄은 근거전표가 없다) → 기존 행 백필 불필요.
-- FK 컬럼 인덱스는 직접 만든다(CLAUDE.md 7.1 — PostgreSQL 은 자동 생성하지 않는다).

ALTER TABLE sales_lines ADD COLUMN source_order_id bigint;
ALTER TABLE sales_lines ADD CONSTRAINT fk_sales_lines_source_order
    FOREIGN KEY (source_order_id) REFERENCES sales_orders (id);
CREATE INDEX idx_sales_lines_source_order ON sales_lines (source_order_id);

ALTER TABLE purchase_lines ADD COLUMN source_order_id bigint;
ALTER TABLE purchase_lines ADD CONSTRAINT fk_purchase_lines_source_order
    FOREIGN KEY (source_order_id) REFERENCES purchase_orders (id);
CREATE INDEX idx_purchase_lines_source_order ON purchase_lines (source_order_id);
