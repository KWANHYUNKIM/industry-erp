-- 판매·구매 전표의 거래구분 (일반 · 반품).
--
-- 원본 근거(사본) — <b>네 화면</b>이 이 구분을 조건으로 든다:
--   판매일괄회계반영 [거래구분] 일반 · 반품
--   구매일괄회계반영 [구매구분] 일반 · 반품
--   구매단가일괄변경 [구매구분] 전체 · 일반 · 반품
--   일별이익현황     [반품만] · [반품제외]
--
-- 우리에겐 반품 개념이 아예 없어서, 되돌려받은 물건을 다시 '판매' 로 적거나
-- 아무 데도 안 적었다. 어느 쪽이든 재고와 채권이 실제와 어긋난다.
--
-- 반품은 그 거래의 반대다 — 판매반품은 재고가 들어오고 채권이 줄고,
-- 구매반품은 재고가 나가고 채무가 준다. 그래서 저장할 때 수량과 금액을
-- 음수로 뒤집는다(서비스가 한다). 읽는 쪽은 아무것도 안 바꿔도 맞는다.
ALTER TABLE sales ADD COLUMN return_slip boolean;
UPDATE sales SET return_slip = false WHERE return_slip IS NULL;
ALTER TABLE sales ALTER COLUMN return_slip SET NOT NULL;

ALTER TABLE purchases ADD COLUMN return_slip boolean;
UPDATE purchases SET return_slip = false WHERE return_slip IS NULL;
ALTER TABLE purchases ALTER COLUMN return_slip SET NOT NULL;
