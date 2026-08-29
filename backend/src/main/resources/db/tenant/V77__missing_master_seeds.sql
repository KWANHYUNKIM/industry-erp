-- 본사에만 있고 회사에는 없던 마스터 씨앗을 채운다.
--
-- 마이그레이션이 시드하는 표를 본사·회사별로 세어 봤더니 셋이 어긋나 있었다.
-- 셋 다 INSERT 가 public. 으로 못 박혀 있어서, 테넌트는 V1 baseline 에서 <b>표만</b>
-- 받고 씨앗은 못 받았다(V76 의 인쇄 결재란과 같은 까닭).
--
--   공통코드   code_groups   본사 5 · 회사 1   (불량유형만 있고 넷이 빠짐)
--              common_codes  본사 20 · 회사 5
--   통화       currencies    본사 4 · 회사 0
--   급여항목   pay_items     본사 5 · 회사 0
--
-- 없으면 화면이 처음부터 못 쓰인다 — 카드사·결제대행사·결제수단은 고를 목록이 비고,
-- 통화가 없으면 외화 계좌·수출 화면의 통화 드롭다운이 비고, 급여항목이 없으면
-- 급여명세에 붙일 수당·공제가 하나도 없다. 회사를 만든 사람이 이걸 손으로 다시
-- 만들어야 한다는 것을 알 방법도 없다.
--
-- 값은 본사 마이그레이션(V85·V61·V76)에 있는 것을 그대로 옮겼다. 지어내지 않는다.
-- 이미 그 코드가 있는 회사는 건드리지 않는다 — 사람이 고쳐 둔 것을 덮어쓰지 않기 위해서다.

-- ── 공통코드 그룹 ────────────────────────────────────────────────────────
INSERT INTO code_groups (group_code, name, description, system, active)
SELECT v.group_code, v.name, v.description, true, true
  FROM (VALUES
    ('CARD_COMPANY',  '카드사',       '법인카드 발급 카드사'),
    ('PG_COMPANY',    '결제대행사',   '쇼핑몰 결제대행(PG) 업체'),
    ('EXTRA_FIELD',   '추가항목유형', '전표에 붙이는 사용자 정의 항목의 유형'),
    ('PAYMENT_METHOD','결제수단',     '비용·정산의 결제수단')
  ) AS v(group_code, name, description)
 WHERE NOT EXISTS (SELECT 1 FROM code_groups g WHERE g.group_code = v.group_code);

INSERT INTO common_codes (group_id, code, name, sort_order, active)
SELECT g.id, c.code, c.name, c.sort_order, true
  FROM code_groups g
  JOIN (VALUES
    ('CARD_COMPANY',   'BC',        'BC카드',       1),
    ('CARD_COMPANY',   'SHINHAN',   '신한카드',     2),
    ('CARD_COMPANY',   'KB',        'KB국민카드',   3),
    ('CARD_COMPANY',   'SAMSUNG',   '삼성카드',     4),
    ('CARD_COMPANY',   'HYUNDAI',   '현대카드',     5),
    ('PG_COMPANY',     'TOSS',      '토스페이먼츠', 1),
    ('PG_COMPANY',     'NICE',      '나이스페이',   2),
    ('PG_COMPANY',     'KG',        'KG이니시스',   3),
    ('EXTRA_FIELD',    'TEXT',      '문자',         1),
    ('EXTRA_FIELD',    'NUMBER',    '숫자',         2),
    ('EXTRA_FIELD',    'DATE',      '날짜',         3),
    ('EXTRA_FIELD',    'SELECT',    '선택목록',     4),
    ('PAYMENT_METHOD', 'CARD',      '법인카드',     1),
    ('PAYMENT_METHOD', 'TRANSFER',  '계좌이체',     2),
    ('PAYMENT_METHOD', 'CASH',      '현금',         3)
  ) AS c(group_code, code, name, sort_order) ON c.group_code = g.group_code
 WHERE NOT EXISTS (
   SELECT 1 FROM common_codes x WHERE x.group_id = g.id AND x.code = c.code);

-- ── 통화 ─────────────────────────────────────────────────────────────────
INSERT INTO currencies (code, name, symbol, unit, active)
SELECT v.code, v.name, v.symbol, v.unit, true
  FROM (VALUES
    ('USD', '미국 달러', '$', 1),
    ('JPY', '일본 엔',   '¥', 100),
    ('EUR', '유로',      '€', 1),
    ('CNY', '중국 위안', '¥', 1)
  ) AS v(code, name, symbol, unit)
 WHERE NOT EXISTS (SELECT 1 FROM currencies c WHERE c.code = v.code);

-- ── 급여항목 ─────────────────────────────────────────────────────────────
INSERT INTO pay_items (code, name, kind, taxable, default_amount, active)
SELECT v.code, v.name, v.kind, v.taxable, v.default_amount, true
  FROM (VALUES
    ('MEAL',      '식대',         'ALLOWANCE', false, 200000),
    ('VEHICLE',   '차량유지비',   'ALLOWANCE', false, 200000),
    ('POSITION',  '직책수당',     'ALLOWANCE', true,  300000),
    ('OVERTIME',  '연장근로수당', 'ALLOWANCE', true,  0),
    ('UNION_FEE', '노조회비',     'DEDUCTION', true,  0)
  ) AS v(code, name, kind, taxable, default_amount)
 WHERE NOT EXISTS (SELECT 1 FROM pay_items p WHERE p.code = v.code);
