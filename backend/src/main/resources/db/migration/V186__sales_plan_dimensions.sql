-- 매출계획의 [창고]·[거래처]·[프로젝트].
-- 원본 매출계획 조건 실측(사본): 창고 · 거래처 · 품목 · 프로젝트 (네 화면이 모두 같다).
--
-- 우리 계획은 <b>품목+월</b> 단위뿐이라 "갑 거래처에 A창고에서 얼마 팔겠다" 를 나눠 세울 수가
-- 없었다. 셋 다 nullable 이다 — <b>안 고르면 그 축을 안 나눈다</b>는 뜻이고,
-- 실적을 맞춰 셀 때도 그 축은 전부를 합친다(SalesPlanService.comparison).
alter table sales_plans add column warehouse_id bigint;
alter table sales_plans add column partner_id bigint;
alter table sales_plans add column project_id bigint;

alter table sales_plans add constraint fk_sales_plans_warehouse
  foreign key (warehouse_id) references warehouses (id);
alter table sales_plans add constraint fk_sales_plans_partner
  foreign key (partner_id) references business_partners (id);
alter table sales_plans add constraint fk_sales_plans_project
  foreign key (project_id) references projects (id);

-- FK 컬럼 인덱스는 직접 만든다(CLAUDE.md 7.1).
create index idx_sales_plans_warehouse on sales_plans (warehouse_id);
create index idx_sales_plans_partner on sales_plans (partner_id);
create index idx_sales_plans_project on sales_plans (project_id);
