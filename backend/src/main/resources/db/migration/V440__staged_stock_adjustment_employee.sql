-- 단계별재고실사 머리 [담당자] — 사원 id 만 든다(inventory 는 hr 을 참조하지 않는다. stock_adjustments.employee_id 와 같은 방식).
ALTER TABLE staged_stock_adjustments ADD COLUMN employee_id bigint;
