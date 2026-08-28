-- 발주서의 [프로젝트]. 원본 발주서 조건 실측(사본):
-- 발주No. · 내.외자구분 · 창고 · 프로젝트 · 거래처 · 품목 · 발송여부.
--
-- 발주는 창고·담당자는 물고 있는데 프로젝트만 없었다. 프로젝트별 손익은 판매·구매·비용
-- 전표를 프로젝트로 모아 내는데, <b>발주 단계가 빠져</b> 어느 프로젝트로 주문한 것인지
-- 입고된 뒤에야 알 수 있었다. 발주 시점에는 안 정했을 수 있어 nullable 이다.
alter table purchase_orders add column project_id bigint;

alter table purchase_orders add constraint fk_purchase_orders_project
  foreign key (project_id) references projects (id);

-- FK 컬럼 인덱스는 직접 만든다(CLAUDE.md 7.1).
create index idx_purchase_orders_project on purchase_orders (project_id);
