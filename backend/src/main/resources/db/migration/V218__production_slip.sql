-- 생산입고·생산불출을 원본(이카운트)처럼 <전표 하나 = 여러 줄> 로.
--
-- 원본 생산입고 I·II·III 은 머리(일자·담당자·생산된공장·받는창고·프로젝트) 아래 생산품목을
-- 여러 줄 넣고 [저장] 하면 번호 하나("2026/10/28 -1")가 붙는다. 작업지시서는 [작업지시서]
-- 버튼으로 <불러오는> 것이지 꼭 있어야 하는 것이 아니다. 우리는 줄마다 번호가 따로 붙고
-- 작업지시가 없으면 아예 입고를 못 했다.
--
-- productions 의 한 행은 그대로 <생산품목 한 줄> 이다. 같은 prod_no 를 가진 행들이 한 전표다.
-- 생산불출(material_issues)도 같은 이유로 같은 issue_no 를 여러 줄이 나눠 가진다.

-- 1) 번호는 이제 전표 단위다 — 줄끼리 같은 번호를 쓴다.
ALTER TABLE productions DROP CONSTRAINT ukappdu5d6w6ix2ragqkhgdxumr;
CREATE INDEX idx_productions_prod_no ON productions (prod_no);

ALTER TABLE material_issues DROP CONSTRAINT uk_material_issues_issue_no;
CREATE INDEX idx_material_issues_issue_no ON material_issues (issue_no);

-- 2) 작업지시서 없이도 생산입고를 한다(원본 생산입고 I 은 품목코드만 넣고 저장된다).
ALTER TABLE productions ALTER COLUMN work_order_id DROP NOT NULL;

-- 3) 전표 안 줄 차례, 그리고 어느 입력 화면(I·II·III)으로 넣었나.
--    고칠 때 같은 화면으로 다시 열어야 해서 남긴다(I 은 BOM 자동소모, II·III 은 고른 소모).
ALTER TABLE productions ADD COLUMN line_no integer NOT NULL DEFAULT 1;
ALTER TABLE productions ADD COLUMN entry_type varchar(10) NOT NULL DEFAULT 'I';
ALTER TABLE productions ADD CONSTRAINT ck_productions_entry_type CHECK (entry_type IN ('I', 'II', 'III'));

-- 4) 생산입고 III 의 줄마다 [공정].
ALTER TABLE productions ADD COLUMN process_id bigint;
ALTER TABLE productions ADD CONSTRAINT fk_productions_process FOREIGN KEY (process_id) REFERENCES production_processes (id);
CREATE INDEX idx_productions_process ON productions (process_id);

-- 5) 원본 생산입고 I·II 격자의 [외주비단가]·[외주비합계]·[외주비부가세].
ALTER TABLE productions ADD COLUMN subcontract_unit_price numeric(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE productions ADD COLUMN subcontract_amount numeric(18, 2) NOT NULL DEFAULT 0;
ALTER TABLE productions ADD COLUMN subcontract_vat numeric(18, 2) NOT NULL DEFAULT 0;

-- 6) 원본 [소모] 탭의 [적요].
ALTER TABLE production_materials ADD COLUMN note varchar(255);
