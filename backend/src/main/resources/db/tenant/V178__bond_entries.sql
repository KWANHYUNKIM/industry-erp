-- 회계 II > 채권관리 · 채무관리의 [채권(채무)내역입력] — 원본 E060403 채권조회 [신규(F2)] 창(2026-10-12 loginaa 실측).
-- 전표일자 · 증감구분(증가/감소) 머리 하나에 줄마다 계정 · 거래처 · 채권번호 · 금액 · 만기일자(증가만) · 부서 · 프로젝트 · 적요.
-- 회계전표와 따로 도는 보조장부다 — 저장해도 분개가 생기지 않는다(원본 [회계일자-No.] 빈칸).
CREATE TABLE bond_entries (
    id          bigserial PRIMARY KEY,
    side        varchar(12) NOT NULL CHECK (side IN ('RECEIVABLE', 'PAYABLE')),
    entry_date  date NOT NULL,
    entry_no    integer NOT NULL,
    direction   varchar(10) NOT NULL CHECK (direction IN ('INCREASE', 'DECREASE')),
    created_by  varchar(50),
    updated_by  varchar(50),
    created_at  timestamp(6),
    updated_at  timestamp(6),
    CONSTRAINT uk_bond_entries_side_date_no UNIQUE (side, entry_date, entry_no)
);

CREATE TABLE bond_lines (
    id             bigserial PRIMARY KEY,
    entry_id       bigint NOT NULL REFERENCES bond_entries(id) ON DELETE CASCADE,
    line_no        integer NOT NULL,
    account_id     bigint NOT NULL REFERENCES accounts(id),
    partner_id     bigint REFERENCES business_partners(id),
    bond_no        varchar(30) NOT NULL,
    amount         numeric(18,2) NOT NULL,
    due_date       date,
    department_id  bigint REFERENCES departments(id),
    project_id     bigint REFERENCES projects(id),
    memo           varchar(300)
);
CREATE INDEX idx_bond_lines_entry_id ON bond_lines (entry_id);
CREATE INDEX idx_bond_lines_account_id ON bond_lines (account_id);
CREATE INDEX idx_bond_lines_partner_id ON bond_lines (partner_id);
CREATE INDEX idx_bond_lines_department_id ON bond_lines (department_id);
CREATE INDEX idx_bond_lines_project_id ON bond_lines (project_id);
CREATE INDEX idx_bond_lines_bond_no ON bond_lines (bond_no);
