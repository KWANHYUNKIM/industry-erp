-- 원본 사원등록 [프로젝트] — hr 은 inventory 엔티티를 참조하지 않으므로 id 와 FK 만 둔다
ALTER TABLE public.employees ADD COLUMN project_id bigint;
ALTER TABLE public.employees ADD CONSTRAINT fk_employees_project_id FOREIGN KEY (project_id) REFERENCES public.projects(id);
CREATE INDEX idx_employees_project_id ON public.employees (project_id);
