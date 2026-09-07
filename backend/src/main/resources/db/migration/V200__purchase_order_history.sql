-- 발주(단가요청)의 진행 이력 — 원본 단가요청진행단계 격자의 [이력].
--
-- 우리는 <b>지금 상태만</b> 들고 있었다. 그래서 "이 발주가 언제 단가확정으로 넘어갔나",
-- "누가 취소했나" 를 물을 수가 없었다 — 늦어진 발주를 두고 어디서 멈춰 있었는지
-- 아무도 답하지 못했다.
--
-- FK 컬럼에는 인덱스를 직접 만든다(CLAUDE.md 7.1) — 발주를 지울 때 이 표를 전부 훑는다.
CREATE TABLE purchase_order_histories (
    id            bigserial PRIMARY KEY,
    order_id      bigint      NOT NULL,
    changed_at    timestamp   NOT NULL,
    from_status   varchar(20),
    to_status     varchar(20) NOT NULL,
    changed_by    varchar(50),
    note          varchar(300),
    CONSTRAINT fk_po_histories_order FOREIGN KEY (order_id)
        REFERENCES purchase_orders(id) ON DELETE CASCADE
);
CREATE INDEX idx_po_histories_order ON purchase_order_histories(order_id);
