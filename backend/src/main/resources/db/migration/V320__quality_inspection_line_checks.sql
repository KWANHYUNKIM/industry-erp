-- 원본 품질검사입력(E040621) 줄의 [검사항목] (2026-10-12 loginaa 실측):
--  품목에 붙은 품질검사유형의 검사항목(코드형 · 숫자형 · 문자형 칸)을 [내역] 창에 펴서 값을 적는다.
--  코드형은 상세항목을 고르고(상 · 중 · 하), 숫자형 · 문자형은 적는다. 줄마다 항목별 값 하나.
CREATE TABLE quality_inspection_line_checks (
    line_id       bigint       NOT NULL REFERENCES quality_inspection_lines (id),
    seq           integer      NOT NULL,
    check_item_id bigint       NOT NULL REFERENCES quality_check_items (id),
    detail_id     bigint       REFERENCES quality_check_item_details (id),
    value         varchar(200) NOT NULL,
    PRIMARY KEY (line_id, seq)
);
CREATE INDEX idx_quality_inspection_line_checks_item ON quality_inspection_line_checks (check_item_id);
CREATE INDEX idx_quality_inspection_line_checks_detail ON quality_inspection_line_checks (detail_id);
