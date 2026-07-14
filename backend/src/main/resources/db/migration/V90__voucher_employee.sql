-- V90: 전표 담당자(사원) — 판매·구매 전표에 담당 사원을 붙인다
--
-- created_by 는 '누가 입력했는가'(로그인 계정)다. 담당자는 '누구의 실적인가'다. 둘은 다르다 —
-- 사무직원이 영업사원 대신 전표를 넣는 순간 실적이 사무직원에게 붙는다.
-- 그래서 사원 마스터(employees)를 FK 로 건다. 프로젝트를 붙였던 것과 같은 방식이다.
--
-- 기존 전표는 담당자가 없다(NULL). 소급해서 넣지 않는다 — 누구 실적인지 모르는 걸
-- 아무나로 채우면 실적표가 조용히 거짓말을 한다.

ALTER TABLE public.sales     ADD COLUMN employee_id bigint;
ALTER TABLE public.purchases ADD COLUMN employee_id bigint;

ALTER TABLE public.sales
    ADD CONSTRAINT fk_sales_employee_id FOREIGN KEY (employee_id) REFERENCES public.employees(id);
ALTER TABLE public.purchases
    ADD CONSTRAINT fk_purchases_employee_id FOREIGN KEY (employee_id) REFERENCES public.employees(id);

CREATE INDEX idx_sales_employee_id     ON public.sales (employee_id);
CREATE INDEX idx_purchases_employee_id ON public.purchases (employee_id);
