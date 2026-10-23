-- 견적서의 [담당자]. 원본 견적서입력 머리(일자 · 거래처 · 담당자 · 출하창고 · 프로젝트)와 견적서조회 [사원(담당)명] 실측.
-- 주문서(V190)와 같은 방식 — employees 를 직접 문다. 견적 시점에 안 정했을 수 있어 nullable.
alter table quotations add column employee_id bigint;
alter table quotations add constraint fk_quotations_employee
  foreign key (employee_id) references employees (id);
create index idx_quotations_employee on quotations (employee_id);
