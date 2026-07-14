-- V95: created_by 를 users(username) 에 FK 로 묶는다
--
-- created_by 는 지금까지 그냥 varchar 였다. 존재하지 않는 사용자명이 들어가도 DB 는 받아줬고,
-- 사용자를 지우면 전표는 사라진 사람의 이름을 붙들고 남았다. 45개 테이블이 전부 그랬다.
--
-- 컬럼을 user_id 로 바꾸지 않고 자연키(username) 에 FK 를 건다. 엔티티 44개·서비스·DTO 를
-- 전부 뜯지 않고도 필요한 세 가지를 얻는다:
--   1) 없는 사용자명은 애초에 들어가지 못한다 (무결성)
--   2) ON UPDATE CASCADE — 계정을 개명하면 전표의 작성자도 따라 바뀐다
--   3) ON DELETE RESTRICT — 작성 이력이 있는 계정은 지울 수 없다. 이력을 잃느니 사용중지로 내린다
--
-- created_by 는 NULL 을 허용한다. 시스템이 만든 행(마이그레이션 시드 등)은 작성자가 없다.
-- FK 자식 컬럼에는 인덱스를 직접 만든다 — PostgreSQL 은 자동으로 만들지 않고, 없으면
-- 사용자를 지울 때(RESTRICT 검사) 45개 테이블을 전부 순차 스캔한다.

-- 안전장치: 사용자 목록에 없는 작성자가 남아 있으면 FK 생성이 실패한다. 먼저 비운다.
-- (2026-07-14 운영 DB 기준 고아 0건이지만, 다른 환경을 위해 남긴다.)

UPDATE public.account_transfers SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.as_requests SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.bank_checks SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.bank_transactions SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.budgets SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.business_contracts SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.card_payments SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.card_usages SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.cash_plans SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.corporate_tax_returns SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.daily_work_records SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.depreciations SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.employee_assignments SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.employment_contracts SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.exchange_rates SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.expenses SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.export_orders SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.fast_vouchers SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.fixed_assets SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.incomes SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.journal_entries SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.mall_orders SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.non_cash_transactions SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.other_withholdings SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.payroll_transfers SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.payslips SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.production_plans SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.productions SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.projects SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.promissory_notes SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.purchase_orders SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.purchases SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.quotations SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.sales SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.sales_orders SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.schedule_events SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.settlements SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.shipments SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.stock_adjustments SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.stock_lots SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.stock_transactions SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.stock_transfers SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.surveys SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.tax_invoices SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);
UPDATE public.work_orders SET created_by = NULL
 WHERE created_by IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = created_by);

-- FK + 인덱스
ALTER TABLE public.account_transfers
    ADD CONSTRAINT fk_account_transfers_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_account_transfers_created_by ON public.account_transfers (created_by);
ALTER TABLE public.as_requests
    ADD CONSTRAINT fk_as_requests_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_as_requests_created_by ON public.as_requests (created_by);
ALTER TABLE public.bank_checks
    ADD CONSTRAINT fk_bank_checks_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_bank_checks_created_by ON public.bank_checks (created_by);
ALTER TABLE public.bank_transactions
    ADD CONSTRAINT fk_bank_transactions_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_bank_transactions_created_by ON public.bank_transactions (created_by);
ALTER TABLE public.budgets
    ADD CONSTRAINT fk_budgets_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_budgets_created_by ON public.budgets (created_by);
ALTER TABLE public.business_contracts
    ADD CONSTRAINT fk_business_contracts_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_business_contracts_created_by ON public.business_contracts (created_by);
ALTER TABLE public.card_payments
    ADD CONSTRAINT fk_card_payments_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_card_payments_created_by ON public.card_payments (created_by);
ALTER TABLE public.card_usages
    ADD CONSTRAINT fk_card_usages_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_card_usages_created_by ON public.card_usages (created_by);
ALTER TABLE public.cash_plans
    ADD CONSTRAINT fk_cash_plans_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_cash_plans_created_by ON public.cash_plans (created_by);
ALTER TABLE public.corporate_tax_returns
    ADD CONSTRAINT fk_corporate_tax_returns_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_corporate_tax_returns_created_by ON public.corporate_tax_returns (created_by);
ALTER TABLE public.daily_work_records
    ADD CONSTRAINT fk_daily_work_records_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_daily_work_records_created_by ON public.daily_work_records (created_by);
ALTER TABLE public.depreciations
    ADD CONSTRAINT fk_depreciations_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_depreciations_created_by ON public.depreciations (created_by);
ALTER TABLE public.employee_assignments
    ADD CONSTRAINT fk_employee_assignments_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_employee_assignments_created_by ON public.employee_assignments (created_by);
ALTER TABLE public.employment_contracts
    ADD CONSTRAINT fk_employment_contracts_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_employment_contracts_created_by ON public.employment_contracts (created_by);
ALTER TABLE public.exchange_rates
    ADD CONSTRAINT fk_exchange_rates_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_exchange_rates_created_by ON public.exchange_rates (created_by);
ALTER TABLE public.expenses
    ADD CONSTRAINT fk_expenses_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_expenses_created_by ON public.expenses (created_by);
ALTER TABLE public.export_orders
    ADD CONSTRAINT fk_export_orders_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_export_orders_created_by ON public.export_orders (created_by);
ALTER TABLE public.fast_vouchers
    ADD CONSTRAINT fk_fast_vouchers_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_fast_vouchers_created_by ON public.fast_vouchers (created_by);
ALTER TABLE public.fixed_assets
    ADD CONSTRAINT fk_fixed_assets_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_fixed_assets_created_by ON public.fixed_assets (created_by);
ALTER TABLE public.incomes
    ADD CONSTRAINT fk_incomes_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_incomes_created_by ON public.incomes (created_by);
ALTER TABLE public.journal_entries
    ADD CONSTRAINT fk_journal_entries_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_journal_entries_created_by ON public.journal_entries (created_by);
ALTER TABLE public.mall_orders
    ADD CONSTRAINT fk_mall_orders_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_mall_orders_created_by ON public.mall_orders (created_by);
ALTER TABLE public.non_cash_transactions
    ADD CONSTRAINT fk_non_cash_transactions_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_non_cash_transactions_created_by ON public.non_cash_transactions (created_by);
ALTER TABLE public.other_withholdings
    ADD CONSTRAINT fk_other_withholdings_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_other_withholdings_created_by ON public.other_withholdings (created_by);
ALTER TABLE public.payroll_transfers
    ADD CONSTRAINT fk_payroll_transfers_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_payroll_transfers_created_by ON public.payroll_transfers (created_by);
ALTER TABLE public.payslips
    ADD CONSTRAINT fk_payslips_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_payslips_created_by ON public.payslips (created_by);
ALTER TABLE public.production_plans
    ADD CONSTRAINT fk_production_plans_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_production_plans_created_by ON public.production_plans (created_by);
ALTER TABLE public.productions
    ADD CONSTRAINT fk_productions_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_productions_created_by ON public.productions (created_by);
ALTER TABLE public.projects
    ADD CONSTRAINT fk_projects_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_projects_created_by ON public.projects (created_by);
ALTER TABLE public.promissory_notes
    ADD CONSTRAINT fk_promissory_notes_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_promissory_notes_created_by ON public.promissory_notes (created_by);
ALTER TABLE public.purchase_orders
    ADD CONSTRAINT fk_purchase_orders_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_purchase_orders_created_by ON public.purchase_orders (created_by);
ALTER TABLE public.purchases
    ADD CONSTRAINT fk_purchases_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_purchases_created_by ON public.purchases (created_by);
ALTER TABLE public.quotations
    ADD CONSTRAINT fk_quotations_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_quotations_created_by ON public.quotations (created_by);
ALTER TABLE public.sales
    ADD CONSTRAINT fk_sales_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_sales_created_by ON public.sales (created_by);
ALTER TABLE public.sales_orders
    ADD CONSTRAINT fk_sales_orders_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_sales_orders_created_by ON public.sales_orders (created_by);
ALTER TABLE public.schedule_events
    ADD CONSTRAINT fk_schedule_events_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_schedule_events_created_by ON public.schedule_events (created_by);
ALTER TABLE public.settlements
    ADD CONSTRAINT fk_settlements_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_settlements_created_by ON public.settlements (created_by);
ALTER TABLE public.shipments
    ADD CONSTRAINT fk_shipments_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_shipments_created_by ON public.shipments (created_by);
ALTER TABLE public.stock_adjustments
    ADD CONSTRAINT fk_stock_adjustments_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_stock_adjustments_created_by ON public.stock_adjustments (created_by);
ALTER TABLE public.stock_lots
    ADD CONSTRAINT fk_stock_lots_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_stock_lots_created_by ON public.stock_lots (created_by);
ALTER TABLE public.stock_transactions
    ADD CONSTRAINT fk_stock_transactions_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_stock_transactions_created_by ON public.stock_transactions (created_by);
ALTER TABLE public.stock_transfers
    ADD CONSTRAINT fk_stock_transfers_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_stock_transfers_created_by ON public.stock_transfers (created_by);
ALTER TABLE public.surveys
    ADD CONSTRAINT fk_surveys_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_surveys_created_by ON public.surveys (created_by);
ALTER TABLE public.tax_invoices
    ADD CONSTRAINT fk_tax_invoices_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_tax_invoices_created_by ON public.tax_invoices (created_by);
ALTER TABLE public.work_orders
    ADD CONSTRAINT fk_work_orders_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_work_orders_created_by ON public.work_orders (created_by);
