-- 생산입고에 [첨부] — 원본 생산입고입력(I·II·III) 머리 맨 끝의 [첨부]. 작업지시서(V231)와 같은 꼴:
-- stored_files 에 FK, 한 전표(같은 prod_no)의 줄들이 같은 파일을 가리킨다.
ALTER TABLE productions ADD COLUMN attachment_id bigint;
ALTER TABLE productions ADD CONSTRAINT fk_productions_attachment
    FOREIGN KEY (attachment_id) REFERENCES stored_files (id);
CREATE INDEX idx_productions_attachment ON productions (attachment_id);
