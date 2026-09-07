-- 출하·정산의 [프로젝트].
--
-- 원본 조건 판 실측(사본):
--   출하현황 — 출하No. · 창고 · 프로젝트 · 관리항목 · 거래처 · 품목 · 시리얼/로트No.
--   수금현황·지급현황 — 기준일자 · 거래처 · 부서 · 프로젝트 · 거래처관리담당자
--
-- 판매·구매·비용은 진작 프로젝트를 다는데(그래서 Project 를 inventory 로 옮겼다)
-- 출하와 정산만 안 달았다. 프로젝트별 손익을 집계한다면서 <b>돈이 들어오고 나가는 전표</b>가
-- 프로젝트를 모르면, 그 프로젝트로 얼마를 받았는지 셀 수가 없다.
alter table shipments add column project_id bigint;
alter table shipments
    add constraint fk_shipments_project foreign key (project_id) references projects (id);
create index idx_shipments_project on shipments (project_id);

alter table settlements add column project_id bigint;
alter table settlements
    add constraint fk_settlements_project foreign key (project_id) references projects (id);
create index idx_settlements_project on settlements (project_id);
