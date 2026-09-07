-- 생산입고 전표의 담당자(사원). 원본 생산입고 I·II·III 머리의 [담당자].
-- 작업지시(work_orders.employee_id)와 같이 id 만 든다 — production 은 hr 을 참조할 수 없다.
-- 이름은 화면이 사원 목록에서 붙인다.
alter table productions add column employee_id bigint;
create index idx_productions_employee on productions (employee_id);
