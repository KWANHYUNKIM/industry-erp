-- 생산불출의 [담당자].
--
-- 원본 생산불출입력·생산불출조회의 머리 항목이 일자 · 담당자 · 보내는창고 · 받는공장 ·
-- 생산품목이고, 생산불출현황의 조건에도 [담당자] 가 있다. 세 화면에서 나온 항목이다.
--
-- 우리 생산불출에는 담당자가 없어 "누가 낸 불출인지" 를 적을 자리도, 그걸로 거를 자리도 없었다.
--
-- FK 를 걸지 않는다. production 이 hr 을 참조하면 hr → accounting → production 과
-- 맞물려 순환이 된다(CLAUDE.md 4.1) — 작업지시의 담당자와 같은 이유다.
alter table material_issues add column employee_id bigint;
create index idx_material_issues_employee on material_issues (employee_id);
