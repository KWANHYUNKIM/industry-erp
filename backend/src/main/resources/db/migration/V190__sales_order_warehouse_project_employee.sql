-- 수주(주문)의 [창고]·[프로젝트]·[담당자]. 원본 미출하현황·수주 조회 조건 실측(사본).
--
-- 견적(V182)과 판매(전부터)는 창고·프로젝트를 무는데 <b>그 사이의 수주만</b> 없었다.
-- 견적 → 수주 → 판매로 이어질 때 <b>가운데 토막에서 끊겨</b>, 미출하현황에서
-- "A창고에서 나갈 것" 이나 "○○ 프로젝트 몫" 을 골라낼 수가 없었다.
-- 셋 다 수주 시점에 안 정했을 수 있어 nullable 이다.
alter table sales_orders add column warehouse_id bigint;
alter table sales_orders add column project_id bigint;
alter table sales_orders add column employee_id bigint;

alter table sales_orders add constraint fk_sales_orders_warehouse
  foreign key (warehouse_id) references warehouses (id);
alter table sales_orders add constraint fk_sales_orders_project
  foreign key (project_id) references projects (id);
alter table sales_orders add constraint fk_sales_orders_employee
  foreign key (employee_id) references employees (id);

-- FK 컬럼 인덱스는 직접 만든다(CLAUDE.md 7.1).
create index idx_sales_orders_warehouse on sales_orders (warehouse_id);
create index idx_sales_orders_project on sales_orders (project_id);
create index idx_sales_orders_employee on sales_orders (employee_id);
