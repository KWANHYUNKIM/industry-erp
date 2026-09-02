-- 생산입고의 [프로젝트].
--
-- 원본 생산입고현황 조건 판 실측(사본):
--   [구분] · 일자 · 창고 · 프로젝트 · 품목 · 담당자 · 적요
--
-- 판매·구매·비용·출하·정산이 모두 프로젝트를 다는데 생산입고만 남았다.
-- 프로젝트별 손익을 집계하려면 <b>그 프로젝트로 무엇을 만들었나</b>도 알아야 한다 —
-- 팔린 것만 세면 아직 재고로 남은 생산분이 어느 프로젝트 것인지 잃는다.
alter table productions add column project_id bigint;

alter table productions
    add constraint fk_productions_project foreign key (project_id) references projects (id);

create index idx_productions_project on productions (project_id);
