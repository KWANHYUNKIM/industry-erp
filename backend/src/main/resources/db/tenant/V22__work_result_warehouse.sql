-- 작업내역의 [생산공장].
--
-- 원본 작업내역입력의 머리 항목이고, 작업내역조회·작업내역현황 두 화면의 열이기도 하다.
-- 우리 작업내역에는 그 값이 없어 "이 작업을 어느 공장에서 했나" 를 되짚을 자리가 없었다.
-- 창고 마스터의 [구분]이 공장인 행을 가리킨다.
--
-- 기존 행은 어느 공장인지 알 길이 없으므로 nullable 이다. 빈칸을 임의의 공장으로 채우면
-- 하지 않은 작업을 그 공장이 한 것으로 만든다.
alter table work_results add column warehouse_id bigint;

alter table work_results
    add constraint fk_work_results_warehouse
    foreign key (warehouse_id) references warehouses (id);

-- PostgreSQL 은 FK 를 만들어도 참조하는 쪽 컬럼에 인덱스를 만들지 않는다.
-- 없으면 공장별 조회가 순차 스캔이 되고, 창고를 지울 때 이 표를 전부 훑는다.
create index idx_work_results_warehouse on work_results (warehouse_id);
