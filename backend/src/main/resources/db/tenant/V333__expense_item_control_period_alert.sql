-- 비용등록 지정기간 통제기간(원본 2026-10-22: 통제유형 기간이 '지정기간' 이면 비용 창에 통제기간 날짜 칸, 목록 기간 '2026/10/22 ~2026/10/22') · [통제알림대상](대상자선택 — 사원 여럿)
ALTER TABLE expense_items ADD COLUMN control_from date;
ALTER TABLE expense_items ADD COLUMN control_to date;

CREATE TABLE expense_item_alert_targets (
    expense_item_id bigint NOT NULL,
    employee_id     bigint NOT NULL,
    CONSTRAINT pk_expense_item_alert_targets PRIMARY KEY (expense_item_id, employee_id),
    CONSTRAINT fk_expense_item_alert_targets_item FOREIGN KEY (expense_item_id) REFERENCES expense_items (id) ON DELETE CASCADE,
    CONSTRAINT fk_expense_item_alert_targets_employee FOREIGN KEY (employee_id) REFERENCES employees (id)
);
CREATE INDEX idx_expense_item_alert_targets_employee_id ON expense_item_alert_targets (employee_id);
