-- 작업지시서에 [첨부] — 원본 작업지시서입력 머리의 [첨부](도면·작업표준서를 붙여 현장에 내린다).
-- 업무게시판(V169)과 같은 꼴: stored_files 에 FK, 한 전표(같은 order_no)의 줄들이 같은 파일을 가리킨다.
ALTER TABLE work_orders ADD COLUMN attachment_id bigint;
ALTER TABLE work_orders ADD CONSTRAINT fk_work_orders_attachment
    FOREIGN KEY (attachment_id) REFERENCES stored_files (id);
CREATE INDEX idx_work_orders_attachment ON work_orders (attachment_id);
