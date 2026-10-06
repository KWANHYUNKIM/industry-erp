-- 인사발령입력(원본 E020721): 발령을 전표(일자-No.)로 묶고, 줄마다 이전 직위·부서와 입사구분을 남긴다.
-- 원본 발령구분 '인사발령'(직위·부서만 바꾸는 일반 발령)을 GENERAL 로 더한다.
ALTER TABLE public.employee_assignments ADD COLUMN slip_date date;
ALTER TABLE public.employee_assignments ADD COLUMN slip_no integer;
ALTER TABLE public.employee_assignments ADD COLUMN prev_job_title varchar(100);
ALTER TABLE public.employee_assignments ADD COLUMN prev_department_id bigint;
ALTER TABLE public.employee_assignments ADD COLUMN hire_kind varchar(50);

UPDATE public.employee_assignments a SET slip_date = a.assign_date,
       slip_no = n.rn
FROM (SELECT id, row_number() OVER (PARTITION BY assign_date ORDER BY id) AS rn FROM public.employee_assignments) n
WHERE n.id = a.id;
ALTER TABLE public.employee_assignments ALTER COLUMN slip_date SET NOT NULL;
ALTER TABLE public.employee_assignments ALTER COLUMN slip_no SET NOT NULL;

ALTER TABLE public.employee_assignments ADD CONSTRAINT fk_employee_assignments_prev_department_id
    FOREIGN KEY (prev_department_id) REFERENCES public.departments(id);
CREATE INDEX idx_employee_assignments_prev_department_id ON public.employee_assignments (prev_department_id);
CREATE INDEX idx_employee_assignments_slip ON public.employee_assignments (slip_date, slip_no);

ALTER TABLE public.employee_assignments DROP CONSTRAINT ck_employee_assignments_type;
ALTER TABLE public.employee_assignments ADD CONSTRAINT ck_employee_assignments_type
    CHECK (type IN ('HIRE', 'TRANSFER', 'PROMOTION', 'RESIGN', 'REHIRE', 'GENERAL'));
