-- 견적서의 [창고]·[프로젝트]. 원본 견적서 조건 실측(사본):
-- 기준일자 · 견적No. · 내.외자구분 · 창고 · 프로젝트 · 관리항목 · 거래처 · 품목 · 발송여부.
--
-- 판매전표(sales)는 둘 다 이미 물고 있는데 견적만 없었다. 견적이 수주로, 수주가 판매로
-- 이어지는데 <b>맨 앞에서 정한 창고·프로젝트가 중간에 끊겨</b> 다시 골라야 했다.
-- 견적 시점에는 안 정했을 수 있으므로 둘 다 nullable 이다.
alter table quotations add column warehouse_id bigint;
alter table quotations add column project_id bigint;

alter table quotations add constraint fk_quotations_warehouse
  foreign key (warehouse_id) references warehouses (id);
alter table quotations add constraint fk_quotations_project
  foreign key (project_id) references projects (id);

-- PostgreSQL 은 FK 를 만들어도 참조하는 쪽 컬럼에 인덱스를 자동 생성하지 않는다(CLAUDE.md 7.1).
create index idx_quotations_warehouse on quotations (warehouse_id);
create index idx_quotations_project on quotations (project_id);
