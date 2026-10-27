ALTER TABLE multi_slips ADD COLUMN attachment_id bigint;
ALTER TABLE multi_slips ADD CONSTRAINT fk_multi_slips_attachment
    FOREIGN KEY (attachment_id) REFERENCES stored_files (id);
CREATE INDEX idx_multi_slips_attachment ON multi_slips (attachment_id);
