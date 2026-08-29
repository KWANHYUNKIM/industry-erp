-- 생산불출의 전표번호 — 원본 생산불출·생산불출조회의 첫 열 [일자-No.].
--
-- 우리 불출에는 <b>번호가 없었다.</b> 날짜만 있으니 같은 날 여러 건을 가리킬 말이 없고,
-- 불출증을 찍어도 무엇을 찍은 종이인지 적히지 않았다. 다른 전표는 다 번호를 다는데
-- 여기만 없었다.
--
-- 기존 행에는 날짜순으로 번호를 매겨 채운다(같은 날은 id 순). 그 뒤에 NOT NULL 을 건다 —
-- 데이터가 있는 표에 NOT NULL 을 한 번에 걸면 실패한다(CLAUDE.md 7.2).
ALTER TABLE material_issues ADD COLUMN issue_no varchar(30);

UPDATE material_issues m SET issue_no = t.no FROM (
    SELECT id, 'MI-' || to_char(issue_date, 'YYYYMMDD') || '-'
           || lpad(row_number() OVER (PARTITION BY issue_date ORDER BY id)::text, 4, '0') AS no
    FROM material_issues
) t WHERE m.id = t.id;

ALTER TABLE material_issues ALTER COLUMN issue_no SET NOT NULL;
ALTER TABLE material_issues ADD CONSTRAINT uk_material_issues_issue_no UNIQUE (issue_no);
