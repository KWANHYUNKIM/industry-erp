-- 원본 근로계약서진행단계 [수신정보입력] › 계약참여자1 [항목등록] (C061103, 2026-10-24 실측):
-- 계약서마다 항목(항목명)을 두고, 등록한 항목은 [전송정보입력] 격자에 열로 붙어 받는 사람마다 값을 적는다.
-- 우리는 계약서에 받는 사원이 하나라 값도 항목 줄에 하나(value)를 둔다. 계약서를 지우면 항목도 지운다.
CREATE TABLE employment_contract_items (
    id          bigserial    PRIMARY KEY,
    contract_id bigint       NOT NULL REFERENCES employment_contracts(id) ON DELETE CASCADE,
    name        varchar(100) NOT NULL,
    value       varchar(200),
    sort_order  integer      NOT NULL DEFAULT 0
);
CREATE INDEX idx_employment_contract_items_contract ON employment_contract_items(contract_id);
