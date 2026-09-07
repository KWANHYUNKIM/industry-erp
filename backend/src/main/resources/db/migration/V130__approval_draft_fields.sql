-- 기안서작성 폼에서 원본에 있는데 우리에게 없던 칸들.
-- 이카운트 기안서작성(E070103) 팝업: 구분 · 출력양식 · 기안서No. · 결재문서 · 첨부 · 라벨.
--
-- 이 중 **기안서No.(doc_no)와 결재문서(approval_document_vouchers)는 이미 있었고 화면만 안 쓰고 있었다.**
-- 여기서 더하는 것은 구분·출력양식·라벨·첨부 넷이다.
--
-- 첨부는 공용 파일 저장(stored_files, V120)을 그대로 쓴다 — ECDrive·증빙센터와 같은 인프라다.
-- 전부 선택 입력이라 nullable → 기존 행 백필 불필요.
-- FK 컬럼 인덱스는 직접 만든다(CLAUDE.md 7.1).

ALTER TABLE approval_documents ADD COLUMN category      varchar(50);
ALTER TABLE approval_documents ADD COLUMN print_format  varchar(50);
ALTER TABLE approval_documents ADD COLUMN label_text    varchar(100);
ALTER TABLE approval_documents ADD COLUMN attachment_id bigint;

ALTER TABLE approval_documents ADD CONSTRAINT fk_approval_documents_attachment
    FOREIGN KEY (attachment_id) REFERENCES stored_files (id);
CREATE INDEX idx_approval_documents_attachment ON approval_documents (attachment_id);
