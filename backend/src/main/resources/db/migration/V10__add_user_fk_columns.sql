-- V10: 전표 작성자를 users FK 로 정규화 (1/2 — 컬럼·FK·인덱스 추가)
--
-- 배경: 작성자를 이름/계정 '문자열'로 들고 있어 조인이 불가능하고,
--       사용자가 개명·퇴사하면 과거 전표의 작성자가 깨진다. 동명이인도 구분 못 한다.
--
-- 이 마이그레이션은 순수 추가(additive)다. 기존 문자열 컬럼은 그대로 두고
-- nullable FK 컬럼만 붙인다. 백필은 V11 에서 한다.
-- NOT NULL 은 매칭 실패분을 사람이 확인한 뒤 별도 마이그레이션에서 건다.
-- (데이터가 있는 테이블에 NOT NULL 을 한 번에 걸면 조용히 실패한다)
--
-- 범위에서 제외한 컬럼:
--   work_results.worker, quality_inspections.inspector -> 로그인 계정이 없는 인원. employees 소관.
--   business_partners.manager                          -> 거래처 '측' 담당자. 내부 사용자가 아님.
--   projects.manager                                   -> PM. 현재 값이 이니셜('KHK')이라 매핑 근거 부족.

ALTER TABLE public.as_requests ADD COLUMN created_by_id BIGINT;
ALTER TABLE public.as_requests ADD CONSTRAINT fk_as_requests_created_by_id FOREIGN KEY (created_by_id) REFERENCES public.users(id);
CREATE INDEX idx_as_requests_created_by_id ON public.as_requests (created_by_id);

ALTER TABLE public.board_posts ADD COLUMN author_id BIGINT;
ALTER TABLE public.board_posts ADD CONSTRAINT fk_board_posts_author_id FOREIGN KEY (author_id) REFERENCES public.users(id);
CREATE INDEX idx_board_posts_author_id ON public.board_posts (author_id);

ALTER TABLE public.expenses ADD COLUMN created_by_id BIGINT;
ALTER TABLE public.expenses ADD CONSTRAINT fk_expenses_created_by_id FOREIGN KEY (created_by_id) REFERENCES public.users(id);
CREATE INDEX idx_expenses_created_by_id ON public.expenses (created_by_id);

ALTER TABLE public.notices ADD COLUMN author_id BIGINT;
ALTER TABLE public.notices ADD CONSTRAINT fk_notices_author_id FOREIGN KEY (author_id) REFERENCES public.users(id);
CREATE INDEX idx_notices_author_id ON public.notices (author_id);

ALTER TABLE public.production_plans ADD COLUMN created_by_id BIGINT;
ALTER TABLE public.production_plans ADD CONSTRAINT fk_production_plans_created_by_id FOREIGN KEY (created_by_id) REFERENCES public.users(id);
CREATE INDEX idx_production_plans_created_by_id ON public.production_plans (created_by_id);

ALTER TABLE public.productions ADD COLUMN created_by_id BIGINT;
ALTER TABLE public.productions ADD CONSTRAINT fk_productions_created_by_id FOREIGN KEY (created_by_id) REFERENCES public.users(id);
CREATE INDEX idx_productions_created_by_id ON public.productions (created_by_id);

ALTER TABLE public.projects ADD COLUMN created_by_id BIGINT;
ALTER TABLE public.projects ADD CONSTRAINT fk_projects_created_by_id FOREIGN KEY (created_by_id) REFERENCES public.users(id);
CREATE INDEX idx_projects_created_by_id ON public.projects (created_by_id);

ALTER TABLE public.purchases ADD COLUMN created_by_id BIGINT;
ALTER TABLE public.purchases ADD CONSTRAINT fk_purchases_created_by_id FOREIGN KEY (created_by_id) REFERENCES public.users(id);
CREATE INDEX idx_purchases_created_by_id ON public.purchases (created_by_id);

ALTER TABLE public.sales ADD COLUMN created_by_id BIGINT;
ALTER TABLE public.sales ADD CONSTRAINT fk_sales_created_by_id FOREIGN KEY (created_by_id) REFERENCES public.users(id);
CREATE INDEX idx_sales_created_by_id ON public.sales (created_by_id);

ALTER TABLE public.sales_orders ADD COLUMN created_by_id BIGINT;
ALTER TABLE public.sales_orders ADD CONSTRAINT fk_sales_orders_created_by_id FOREIGN KEY (created_by_id) REFERENCES public.users(id);
CREATE INDEX idx_sales_orders_created_by_id ON public.sales_orders (created_by_id);

ALTER TABLE public.schedule_events ADD COLUMN created_by_id BIGINT;
ALTER TABLE public.schedule_events ADD CONSTRAINT fk_schedule_events_created_by_id FOREIGN KEY (created_by_id) REFERENCES public.users(id);
CREATE INDEX idx_schedule_events_created_by_id ON public.schedule_events (created_by_id);

ALTER TABLE public.settlements ADD COLUMN created_by_id BIGINT;
ALTER TABLE public.settlements ADD CONSTRAINT fk_settlements_created_by_id FOREIGN KEY (created_by_id) REFERENCES public.users(id);
CREATE INDEX idx_settlements_created_by_id ON public.settlements (created_by_id);

ALTER TABLE public.shipments ADD COLUMN created_by_id BIGINT;
ALTER TABLE public.shipments ADD CONSTRAINT fk_shipments_created_by_id FOREIGN KEY (created_by_id) REFERENCES public.users(id);
CREATE INDEX idx_shipments_created_by_id ON public.shipments (created_by_id);

ALTER TABLE public.stock_lots ADD COLUMN created_by_id BIGINT;
ALTER TABLE public.stock_lots ADD CONSTRAINT fk_stock_lots_created_by_id FOREIGN KEY (created_by_id) REFERENCES public.users(id);
CREATE INDEX idx_stock_lots_created_by_id ON public.stock_lots (created_by_id);

ALTER TABLE public.stock_transactions ADD COLUMN created_by_id BIGINT;
ALTER TABLE public.stock_transactions ADD CONSTRAINT fk_stock_transactions_created_by_id FOREIGN KEY (created_by_id) REFERENCES public.users(id);
CREATE INDEX idx_stock_transactions_created_by_id ON public.stock_transactions (created_by_id);

ALTER TABLE public.stock_transfers ADD COLUMN created_by_id BIGINT;
ALTER TABLE public.stock_transfers ADD CONSTRAINT fk_stock_transfers_created_by_id FOREIGN KEY (created_by_id) REFERENCES public.users(id);
CREATE INDEX idx_stock_transfers_created_by_id ON public.stock_transfers (created_by_id);

ALTER TABLE public.surveys ADD COLUMN created_by_id BIGINT;
ALTER TABLE public.surveys ADD CONSTRAINT fk_surveys_created_by_id FOREIGN KEY (created_by_id) REFERENCES public.users(id);
CREATE INDEX idx_surveys_created_by_id ON public.surveys (created_by_id);

ALTER TABLE public.work_orders ADD COLUMN created_by_id BIGINT;
ALTER TABLE public.work_orders ADD CONSTRAINT fk_work_orders_created_by_id FOREIGN KEY (created_by_id) REFERENCES public.users(id);
CREATE INDEX idx_work_orders_created_by_id ON public.work_orders (created_by_id);

ALTER TABLE public.work_posts ADD COLUMN writer_id BIGINT;
ALTER TABLE public.work_posts ADD CONSTRAINT fk_work_posts_writer_id FOREIGN KEY (writer_id) REFERENCES public.users(id);
CREATE INDEX idx_work_posts_writer_id ON public.work_posts (writer_id);

