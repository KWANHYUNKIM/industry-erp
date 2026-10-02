-- 작업지시서를 원본(이카운트)처럼 <전표 하나 = 여러 품목 줄> 로.
--
-- 원본 작업지시서입력은 머리(일자·납품처·프로젝트·담당자·납기일자) 아래 품목을 여러 줄
-- (품목코드·품목명·규격·수량·생산공장) 넣고 번호 하나("2026/10/07 -1")를 붙인다.
-- 우리는 품목 하나짜리 폼이라 같은 주문의 제품 셋을 지시하려면 번호가 셋 생겼다.
--
-- work_orders 의 한 행은 그대로 <품목 한 줄> 이다(생산입고·생산불출이 줄마다 이 id 를 가리킨다).
-- 같은 order_no 를 가진 행들이 한 전표이고, 그 안의 차례가 line_no 다.

ALTER TABLE work_orders DROP CONSTRAINT ukskpy6yy9qmln30vbmgwvfvhjj;
CREATE INDEX idx_work_orders_order_no ON work_orders (order_no);

ALTER TABLE work_orders ADD COLUMN line_no integer NOT NULL DEFAULT 1;

-- 원본 머리의 [프로젝트]. 생산입고·생산불출은 이미 프로젝트를 단다.
ALTER TABLE work_orders ADD COLUMN project_id bigint;
ALTER TABLE work_orders ADD CONSTRAINT fk_work_orders_project FOREIGN KEY (project_id) REFERENCES projects (id);
CREATE INDEX idx_work_orders_project ON work_orders (project_id);
