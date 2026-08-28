-- 품질검사·A/S 접수의 [창고]·[프로젝트].
-- 원본 품질검사현황 조건: … 창고 · 프로젝트 … / A/S접수·A/S접수현황도 같다.
--
-- 검사는 <b>어느 창고 재고를 본 것인지</b> 적을 데가 없었다 — 같은 품목이 창고 셋에 있으면
-- 어느 것을 본 검사인지 알 수 없었고, 불량률파악보고서에서 창고로 거를 수도 없었다.
-- A/S 도 접수 시점에 창고·프로젝트를 못 적어 소모부품 창고로만 되짚어야 했다.
-- 둘 다 접수·검사 시점에 안 정했을 수 있어 nullable 이다.
alter table quality_inspections add column warehouse_id bigint;
alter table quality_inspections add column project_id bigint;
alter table as_requests add column warehouse_id bigint;
alter table as_requests add column project_id bigint;

alter table quality_inspections add constraint fk_quality_inspections_warehouse
  foreign key (warehouse_id) references warehouses (id);
alter table quality_inspections add constraint fk_quality_inspections_project
  foreign key (project_id) references projects (id);
alter table as_requests add constraint fk_as_requests_warehouse
  foreign key (warehouse_id) references warehouses (id);
alter table as_requests add constraint fk_as_requests_project
  foreign key (project_id) references projects (id);

-- FK 컬럼 인덱스는 직접 만든다(CLAUDE.md 7.1).
create index idx_quality_inspections_warehouse on quality_inspections (warehouse_id);
create index idx_quality_inspections_project on quality_inspections (project_id);
create index idx_as_requests_warehouse on as_requests (warehouse_id);
create index idx_as_requests_project on as_requests (project_id);
