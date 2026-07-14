-- V75: 전표에 프로젝트 연결 (판매·구매·비용) — 프로젝트별 손익의 재료
--
-- 프로젝트(projects)는 지금까지 그룹웨어의 진척관리용 기록일 뿐이었다. 전표 어디에도
-- 프로젝트가 없어서 "이 프로젝트가 얼마를 벌고 얼마를 썼는가"를 물을 수 없었다.
--
-- 프로젝트는 이제 기초등록 마스터다(품목·창고·거래처와 같은 층). 판매·구매·비용 전표가
-- 프로젝트를 참조하고, 프로젝트별 손익은 이 연결을 집계해서 만든다.
--
-- 기존 전표에는 프로젝트가 없으므로 nullable. 프로젝트 없는 전표(일반 영업·간접비)는
-- 앞으로도 정상이다 — 억지로 채우면 프로젝트 손익이 거짓말을 한다.

ALTER TABLE public.sales     ADD COLUMN project_id bigint;
ALTER TABLE public.purchases ADD COLUMN project_id bigint;
ALTER TABLE public.expenses  ADD COLUMN project_id bigint;

ALTER TABLE public.sales
    ADD CONSTRAINT fk_sales_project_id FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE public.purchases
    ADD CONSTRAINT fk_purchases_project_id FOREIGN KEY (project_id) REFERENCES public.projects(id);
ALTER TABLE public.expenses
    ADD CONSTRAINT fk_expenses_project_id FOREIGN KEY (project_id) REFERENCES public.projects(id);

-- FK 컬럼에는 인덱스를 직접 만든다 (PostgreSQL 은 자동 생성하지 않는다).
CREATE INDEX idx_sales_project_id     ON public.sales (project_id);
CREATE INDEX idx_purchases_project_id ON public.purchases (project_id);
CREATE INDEX idx_expenses_project_id  ON public.expenses (project_id);
