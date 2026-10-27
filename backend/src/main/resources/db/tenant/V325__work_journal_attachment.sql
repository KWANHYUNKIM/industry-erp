ALTER TABLE work_journals ADD COLUMN attachment_id bigint;
ALTER TABLE work_journals ADD CONSTRAINT fk_work_journals_attachment
    FOREIGN KEY (attachment_id) REFERENCES stored_files (id);
CREATE INDEX idx_work_journals_attachment ON work_journals (attachment_id);
