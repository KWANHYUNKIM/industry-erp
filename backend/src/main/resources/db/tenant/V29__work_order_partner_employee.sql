-- 작업지시서의 [납품처]와 [담당자].
--
-- 원본 작업지시서입력의 머리 항목이 작업지시No. · 일자 · 납품처 · 담당자 · 납기일자 이고,
-- 작업지시서조회의 열은 일자-No. · 거래처명 · 담당자명 · 납기일자 · 작업지시No. · … 이다.
--
-- 우리 작업지시에는 둘 다 없어서 "이 지시가 어느 거래처 납품 건인지" 도,
-- "누가 맡았는지" 도 적을 자리가 없었다. 납기일자는 진작 있었는데 목록에 안 보여 줬다.
alter table work_orders add column partner_id bigint;

alter table work_orders
    add constraint fk_work_orders_partner
    foreign key (partner_id) references business_partners (id);

-- PostgreSQL 은 FK 를 만들어도 참조하는 쪽 컬럼에 인덱스를 만들지 않는다.
create index idx_work_orders_partner on work_orders (partner_id);

-- 담당자는 사원(hr.Employee) id 만 든다. FK 를 걸지 않는 이유는 자바 쪽 주석에 적었다 —
-- production 이 hr 을 참조하면 hr → accounting → production 과 맞물려 순환이 된다.
alter table work_orders add column employee_id bigint;
create index idx_work_orders_employee on work_orders (employee_id);
