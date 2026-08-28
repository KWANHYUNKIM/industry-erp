-- 창고이동·기타이동(재고조정)의 [프로젝트]·[담당자].
-- 원본 창고이동조회 조건: … 프로젝트 · 담당자 … / 기타이동현황: 창고 · 프로젝트 · 품목 · 담당자 · 적요.
--
-- 재고를 어느 프로젝트로 옮겼는지, 누가 옮겼는지 적을 데가 없어 [적요]에 손으로 적고 있었다.
--
-- 담당자는 <b>사원 테이블을 걸지 않고 id 만</b> 든다. inventory 는 기반층이라 hr 을 참조하면
-- hr → accounting → production 과 맞물려 순환이 된다(CLAUDE.md 4.1). 작업지시(work_orders)와
-- 생산입고(productions)가 이미 같은 방식이다 — 이름은 화면이 사원 목록에서 붙인다.
alter table stock_transfers add column project_id bigint;
alter table stock_transfers add column employee_id bigint;
alter table stock_adjustments add column project_id bigint;
alter table stock_adjustments add column employee_id bigint;

alter table stock_transfers add constraint fk_stock_transfers_project
  foreign key (project_id) references projects (id);
alter table stock_adjustments add constraint fk_stock_adjustments_project
  foreign key (project_id) references projects (id);

-- FK 컬럼 인덱스는 직접 만든다(CLAUDE.md 7.1). employee_id 는 FK 가 없지만 거르는 조건이라 같이 건다.
create index idx_stock_transfers_project on stock_transfers (project_id);
create index idx_stock_transfers_employee on stock_transfers (employee_id);
create index idx_stock_adjustments_project on stock_adjustments (project_id);
create index idx_stock_adjustments_employee on stock_adjustments (employee_id);
