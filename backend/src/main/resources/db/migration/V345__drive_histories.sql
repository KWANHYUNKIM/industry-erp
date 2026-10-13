-- ECDrive [버전/이력] (원본 E077100 버전/이력 창, 2026-10-13 실측)
CREATE TABLE drive_histories (
    id          bigserial PRIMARY KEY,
    document_id bigint       NOT NULL REFERENCES drive_documents (id) ON DELETE CASCADE,
    action      varchar(20)  NOT NULL,
    name        varchar(200) NOT NULL,
    size_bytes  bigint       NOT NULL DEFAULT 0,
    actor       varchar(50),
    ip          varchar(45),
    location    varchar(500),
    created_at  timestamp(6),
    updated_at  timestamp(6)
);
CREATE INDEX idx_drive_histories_document_id ON drive_histories (document_id);
