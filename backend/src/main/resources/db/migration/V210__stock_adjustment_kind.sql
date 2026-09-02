-- 기타이동현황 다섯 화면의 [불량유형]·[사용유형]·[처리방법].
-- 전표에 담을 자리가 없어 그 조건을 만들 수가 없었다.
-- 불량유형·사용유형은 유형이 다른 화면의 같은 자리라 칸 하나로 둔다.
ALTER TABLE stock_adjustments ADD COLUMN kind varchar(30);
ALTER TABLE stock_adjustments ADD COLUMN handling varchar(30);

-- 고를 값은 공통코드에서 온다. [불량유형]은 V196 이 이미 만들어 두었다(DEFECT_TYPE) —
-- 품질검사가 쓰는 그 목록을 기타이동도 같이 본다. 나머지 둘만 만든다.
INSERT INTO code_groups (group_code, name, description, system, active) VALUES
    ('SELF_USE_TYPE', '사용유형', '자가사용으로 재고를 뺄 때의 갈래', true, true),
    ('DEFECT_HANDLING', '처리방법', '불량을 잡은 뒤 어떻게 했나', true, true);

INSERT INTO common_codes (group_id, code, name, sort_order, active)
SELECT g.id, c.code, c.name, c.sort_order, true
FROM code_groups g
JOIN (VALUES
    ('SELF_USE_TYPE',   'SAMPLE',   '견본',     1),
    ('SELF_USE_TYPE',   'TEST',     '시험·검사', 2),
    ('SELF_USE_TYPE',   'INTERNAL', '사내사용',  3),
    ('SELF_USE_TYPE',   'ETC',      '기타',     9),
    ('DEFECT_HANDLING', 'SCRAP',    '폐기',     1),
    ('DEFECT_HANDLING', 'REWORK',   '재작업',   2),
    ('DEFECT_HANDLING', 'RETURN',   '반품',     3),
    ('DEFECT_HANDLING', 'ETC',      '기타',     9)
) AS c(group_code, code, name, sort_order) ON c.group_code = g.group_code;
