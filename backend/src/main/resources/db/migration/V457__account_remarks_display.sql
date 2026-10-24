-- 계정등록: 계정별 적요(적요리스트 · 적요등록) · [표시순서] · 표시방법 탭(들여쓰기순서 · 표시방법1 · 2) — 2026-10-22 loginaa 실측.
CREATE TABLE account_remarks (
    id bigserial PRIMARY KEY,
    created_at timestamp(6) without time zone,
    updated_at timestamp(6) without time zone,
    account_id bigint NOT NULL REFERENCES accounts(id),
    code varchar(10) NOT NULL,
    name varchar(100) NOT NULL,
    CONSTRAINT uk_account_remarks_account_code UNIQUE (account_id, code)
);
CREATE INDEX idx_account_remarks_account_id ON account_remarks (account_id);

ALTER TABLE accounts ADD COLUMN display_order integer;
ALTER TABLE accounts ADD COLUMN indent_order integer;
UPDATE accounts SET indent_order = 0 WHERE indent_order IS NULL;
ALTER TABLE accounts ALTER COLUMN indent_order SET NOT NULL;
ALTER TABLE accounts ALTER COLUMN indent_order SET DEFAULT 0;
ALTER TABLE accounts ADD COLUMN show_method1 boolean NOT NULL DEFAULT false;
ALTER TABLE accounts ADD COLUMN show_method2 boolean NOT NULL DEFAULT false;
