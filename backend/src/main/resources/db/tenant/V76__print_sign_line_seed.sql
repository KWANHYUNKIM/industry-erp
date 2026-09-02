-- 회사마다 기본 결재란이 하나도 없었다 — 본사에만 있었다.
--
-- V71 이 결재란 표를 만들면서 기본 결재란(담당/검토/승인) 한 줄을 시드했는데,
-- 그 INSERT 가 public. 으로 못 박혀 있다. 테넌트는 V1 baseline 에서 <b>표만</b> 받고
-- 씨앗은 못 받았다. 그래서 회사로 로그인해 목록에서 [인쇄]를 누르면
-- 출력물 우측 상단의 결재란이 <b>통째로 안 찍힌다.</b> 있어야 할 칸이 없는 것이라
-- 종이를 받아 든 사람이 도장 찍을 자리를 못 찾는다.
--
-- 기동해서 세어 보니 public 2줄 · co_0002 0줄 · co_0003 0줄 이었다.
--
-- 이미 만들어 둔 회사가 있으면 건드리지 않는다(WHERE NOT EXISTS). 사람이 제 회사에 맞게
-- 고쳐 둔 것을 덮어쓰지 않기 위해서다.

INSERT INTO print_sign_lines (created_at, updated_at, name, is_default, active, remark)
SELECT now(), now(), '기본 결재란', true, true, '출력물 우측 상단에 담당/검토/승인 칸을 찍는다'
 WHERE NOT EXISTS (SELECT 1 FROM print_sign_lines);

INSERT INTO print_sign_slots (sign_line_id, title, signer_name, slot_order)
SELECT l.id, t.title, NULL, t.ord
  FROM print_sign_lines l,
       (VALUES ('담당', 1), ('검토', 2), ('승인', 3)) AS t(title, ord)
 WHERE l.name = '기본 결재란'
   AND NOT EXISTS (SELECT 1 FROM print_sign_slots s WHERE s.sign_line_id = l.id);
