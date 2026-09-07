-- 품질검사의 [불량유형] — 원본 불량률파악보고서(ESM006M)의 조건(코드도움 ddlBadType).
--
-- 우리 검사는 불량<b>수량</b>만 적고 <b>무엇이 잘못됐는지</b>는 어디에도 안 남겼다.
-- 그래서 "이 품목은 불량률 8%" 까지는 말해도 "그중 대부분이 치수불량" 은 말할 수 없었다.
-- 불량률만 알면 고칠 데를 못 찾는다.
--
-- 항목은 회사마다 다르므로 <b>공통코드 그룹</b>으로 둔다(카드사·결제수단과 같은 방식).
-- 검사에는 그 코드를 문자열로 적는다 — quality 가 settings 를 참조하지 않게 하려는 것이다
-- (CLAUDE.md 4.1: 지금 settings 는 어느 모듈과도 안 엮여 있고 그대로 두는 편이 낫다).
ALTER TABLE quality_inspections ADD COLUMN defect_type varchar(50);

INSERT INTO code_groups (group_code, name, description, system, active) VALUES
    ('DEFECT_TYPE', '불량유형', '품질검사에서 잡힌 불량의 갈래', true, true);

INSERT INTO common_codes (group_id, code, name, sort_order, active)
SELECT g.id, c.code, c.name, c.sort_order, true
FROM code_groups g
JOIN (VALUES
    ('DEFECT_TYPE', 'DIMENSION', '치수불량',  1),
    ('DEFECT_TYPE', 'APPEARANCE', '외관불량', 2),
    ('DEFECT_TYPE', 'FUNCTION',  '기능불량',  3),
    ('DEFECT_TYPE', 'MATERIAL',  '재질불량',  4),
    ('DEFECT_TYPE', 'ETC',       '기타',      9)
) AS c(group_code, code, name, sort_order) ON c.group_code = g.group_code;
