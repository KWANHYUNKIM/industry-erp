-- A/S접수 품목 줄 — 원본 A/S접수입력은 품목을 격자로 여러 줄 받는다(품목코드 · 품목명 · 수량, 2026-10-03 loginaa 실측).
-- 우리는 접수에 품목 하나(as_requests.item_id)만 들어 있었다. 기존 접수는 그 품목 1개로 한 줄을 만든다.
-- as_requests.item_id 는 첫 줄 품목으로 남겨 둔다(수리조회 · 현황이 그 값을 읽는다).
CREATE TABLE as_request_lines (
    id            bigserial PRIMARY KEY,
    as_request_id bigint        NOT NULL REFERENCES as_requests (id),
    line_no       integer       NOT NULL,
    item_id       bigint        NOT NULL REFERENCES items (id),
    quantity      numeric(18,4) NOT NULL
);
CREATE INDEX idx_as_request_lines_as_request ON as_request_lines (as_request_id);
CREATE INDEX idx_as_request_lines_item ON as_request_lines (item_id);

INSERT INTO as_request_lines (as_request_id, line_no, item_id, quantity)
SELECT id, 1, item_id, 1 FROM as_requests;
