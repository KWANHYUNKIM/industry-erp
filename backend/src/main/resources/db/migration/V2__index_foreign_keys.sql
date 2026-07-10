-- FK 컬럼 인덱스 추가.
-- PostgreSQL 은 FOREIGN KEY 를 만들어도 참조하는 쪽 컬럼에 인덱스를 자동 생성하지 않는다.
-- 인덱스가 없으면 (1) 자식 행 조회 시 순차 스캔, (2) 부모 행 DELETE/UPDATE 시
-- 참조 무결성 검사를 위해 자식 테이블 전체를 스캔한다.
-- 대상: 인덱스가 전혀 없던 FK 컬럼 55개 (PK/UNIQUE 로 이미 선두 인덱스가 있는 5개는 제외).

CREATE INDEX idx_approval_documents_drafter_id ON public.approval_documents (drafter_id);
CREATE INDEX idx_approval_lines_approver_id ON public.approval_lines (approver_id);
CREATE INDEX idx_approval_lines_document_id ON public.approval_lines (document_id);
CREATE INDEX idx_as_requests_item_id ON public.as_requests (item_id);
CREATE INDEX idx_as_requests_partner_id ON public.as_requests (partner_id);
CREATE INDEX idx_bom_lines_bom_id ON public.bom_lines (bom_id);
CREATE INDEX idx_bom_lines_component_id ON public.bom_lines (component_id);
CREATE INDEX idx_crm_activities_partner_id ON public.crm_activities (partner_id);
CREATE INDEX idx_expenses_account_id ON public.expenses (account_id);
CREATE INDEX idx_lots_item_id ON public.lots (item_id);
CREATE INDEX idx_lots_warehouse_id ON public.lots (warehouse_id);
CREATE INDEX idx_material_issues_item_id ON public.material_issues (item_id);
CREATE INDEX idx_material_issues_warehouse_id ON public.material_issues (warehouse_id);
CREATE INDEX idx_material_issues_work_order_id ON public.material_issues (work_order_id);
CREATE INDEX idx_production_materials_component_id ON public.production_materials (component_id);
CREATE INDEX idx_production_materials_production_id ON public.production_materials (production_id);
CREATE INDEX idx_production_plans_product_id ON public.production_plans (product_id);
CREATE INDEX idx_production_plans_work_order_id ON public.production_plans (work_order_id);
CREATE INDEX idx_productions_product_id ON public.productions (product_id);
CREATE INDEX idx_productions_warehouse_id ON public.productions (warehouse_id);
CREATE INDEX idx_productions_work_order_id ON public.productions (work_order_id);
CREATE INDEX idx_purchase_lines_item_id ON public.purchase_lines (item_id);
CREATE INDEX idx_purchase_lines_purchase_id ON public.purchase_lines (purchase_id);
CREATE INDEX idx_purchases_partner_id ON public.purchases (partner_id);
CREATE INDEX idx_purchases_warehouse_id ON public.purchases (warehouse_id);
CREATE INDEX idx_quality_inspections_item_id ON public.quality_inspections (item_id);
CREATE INDEX idx_quality_inspections_lot_id ON public.quality_inspections (lot_id);
CREATE INDEX idx_sales_partner_id ON public.sales (partner_id);
CREATE INDEX idx_sales_warehouse_id ON public.sales (warehouse_id);
CREATE INDEX idx_sales_lines_item_id ON public.sales_lines (item_id);
CREATE INDEX idx_sales_lines_sales_id ON public.sales_lines (sales_id);
CREATE INDEX idx_sales_order_lines_item_id ON public.sales_order_lines (item_id);
CREATE INDEX idx_sales_order_lines_sales_order_id ON public.sales_order_lines (sales_order_id);
CREATE INDEX idx_sales_orders_partner_id ON public.sales_orders (partner_id);
CREATE INDEX idx_settlements_partner_id ON public.settlements (partner_id);
CREATE INDEX idx_shipment_lines_item_id ON public.shipment_lines (item_id);
CREATE INDEX idx_shipment_lines_order_line_id ON public.shipment_lines (order_line_id);
CREATE INDEX idx_shipment_lines_shipment_id ON public.shipment_lines (shipment_id);
CREATE INDEX idx_shipments_partner_id ON public.shipments (partner_id);
CREATE INDEX idx_shipments_sales_order_id ON public.shipments (sales_order_id);
CREATE INDEX idx_stock_lots_item_id ON public.stock_lots (item_id);
CREATE INDEX idx_stock_lots_warehouse_id ON public.stock_lots (warehouse_id);
CREATE INDEX idx_stock_transactions_item_id ON public.stock_transactions (item_id);
CREATE INDEX idx_stock_transactions_warehouse_id ON public.stock_transactions (warehouse_id);
CREATE INDEX idx_stock_transfers_from_warehouse_id ON public.stock_transfers (from_warehouse_id);
CREATE INDEX idx_stock_transfers_item_id ON public.stock_transfers (item_id);
CREATE INDEX idx_stock_transfers_to_warehouse_id ON public.stock_transfers (to_warehouse_id);
CREATE INDEX idx_stocks_warehouse_id ON public.stocks (warehouse_id);
CREATE INDEX idx_user_roles_role_id ON public.user_roles (role_id);
CREATE INDEX idx_vacation_requests_user_id ON public.vacation_requests (user_id);
CREATE INDEX idx_work_journals_author_id ON public.work_journals (author_id);
CREATE INDEX idx_work_orders_product_id ON public.work_orders (product_id);
CREATE INDEX idx_work_orders_warehouse_id ON public.work_orders (warehouse_id);
CREATE INDEX idx_work_results_process_id ON public.work_results (process_id);
CREATE INDEX idx_work_results_work_order_id ON public.work_results (work_order_id);
