-- 품질검사요청(E040628 입력 · E040629 조회) — 원본은 품목 줄을 든 전표다(2026-10-04 loginaa 실측: 검사방법 · 품목 · 수량).
-- 검사는 [검사요청] 으로 요청을 불러와 잇는다(quality_inspections.request_id) — 요청 목록의 [연결전표] 가 그 검사다.
-- 머리의 품목 · 요청수량은 줄에서 모은 값(첫 줄 · 수량 합)으로 남긴다(미검사현황 · 요청현황이 읽는다).
CREATE TABLE quality_inspection_request_lines (
    id         bigserial PRIMARY KEY,
    request_id bigint        NOT NULL REFERENCES quality_inspection_requests (id),
    line_no    integer       NOT NULL,
    item_id    bigint        NOT NULL REFERENCES items (id),
    method     varchar(20)   NOT NULL CHECK (method IN ('FULL','SAMPLING')),
    quantity   numeric(18,2) NOT NULL
);
CREATE INDEX idx_quality_inspection_request_lines_request ON quality_inspection_request_lines (request_id);
CREATE INDEX idx_quality_inspection_request_lines_item ON quality_inspection_request_lines (item_id);

INSERT INTO quality_inspection_request_lines (request_id, line_no, item_id, method, quantity)
SELECT id, 1, item_id, CASE inspect_method WHEN '샘플링' THEN 'SAMPLING' ELSE 'FULL' END, request_qty
FROM quality_inspection_requests;

ALTER TABLE quality_inspections ADD COLUMN request_id bigint REFERENCES quality_inspection_requests (id);
CREATE INDEX idx_quality_inspections_request ON quality_inspections (request_id);
