ALTER TABLE daily_workers
    ADD COLUMN phone varchar(30),
    ADD COLUMN passport_no varchar(30),
    ADD COLUMN project_id bigint,
    ADD COLUMN attachment_file_id bigint,
    ADD COLUMN text1 varchar(100), ADD COLUMN text2 varchar(100), ADD COLUMN text3 varchar(100),
    ADD COLUMN num1 numeric(18,2), ADD COLUMN num2 numeric(18,2), ADD COLUMN num3 numeric(18,2),
    ADD COLUMN yn1 varchar(1), ADD COLUMN yn2 varchar(1), ADD COLUMN yn3 varchar(1),
    ADD COLUMN date1 date, ADD COLUMN date2 date, ADD COLUMN date3 date,
    ADD COLUMN code1 varchar(50), ADD COLUMN code2 varchar(50), ADD COLUMN code3 varchar(50),
    ADD CONSTRAINT fk_daily_workers_project_id FOREIGN KEY (project_id) REFERENCES projects(id),
    ADD CONSTRAINT fk_daily_workers_attachment_file_id FOREIGN KEY (attachment_file_id) REFERENCES stored_files(id),
    ADD CONSTRAINT ck_daily_workers_yn CHECK ((yn1 IS NULL OR yn1 IN ('Y','N')) AND (yn2 IS NULL OR yn2 IN ('Y','N')) AND (yn3 IS NULL OR yn3 IN ('Y','N')));
CREATE INDEX idx_daily_workers_project_id ON daily_workers (project_id);
CREATE INDEX idx_daily_workers_attachment_file_id ON daily_workers (attachment_file_id);
