-- 오더관리유형(E040901)의 단계 한 칸을 원본처럼 <처리메뉴 + 불러오기 기준> 으로 바꾼다(2026-10-30 loginaa 실측).
--
-- 원본 [오더관리유형수정] 창은 처리단계 1~10 줄마다 [처리메뉴](그 단계가 어느 입력 화면인가 —
-- 구매 · 판매(거래명세서) · 주문서 · 발주서 · 작지 · 생산2 · 견적서 · 지급 · 자가사용 …)와
-- [불러오기 기준](앞 단계 중 하나 — 2단계 ← 처리단계1(구매))을 고른다.
-- 우리는 단계를 '진행단계 이름 마스터'(order_stages)에서 골랐다.
--
-- 옛 줄은 그대로 둔다 — order_stage_id 를 비워도 되게만 바꾸고, 처리메뉴가 없는 옛 줄은 화면이
-- 단계 마스터 이름을 그대로 보인다(0001 의 시험 자료). 새 줄은 처리메뉴만 든다.
ALTER TABLE order_type_steps ALTER COLUMN order_stage_id DROP NOT NULL;

-- 처리메뉴: 화면 경로(/sales/buy) + 원본 이름(구매). 경로만 두면 서버 · 다른 화면이 이름을 알 수 없다.
ALTER TABLE order_type_steps ADD COLUMN proc_menu varchar(200);
ALTER TABLE order_type_steps ADD COLUMN proc_menu_name varchar(50);
-- 불러오기 기준: 같은 유형의 앞 단계 순번(1~). 없으면 null.
ALTER TABLE order_type_steps ADD COLUMN source_seq integer;
