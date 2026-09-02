-- 품목의 [재고수량관리] — 수량관리대상 / 수량관리제외.
--
-- 원본 품목등록 리스트의 열이고(줄 값이 '수량관리대상'·'수량관리제외'),
-- 일별이익현황 조건에도 [수량관리제외품목포함] 이 있다.
--
-- 우리는 <b>모든 품목의 재고를 잡았다</b>. 용역·운반비 같은 품목을 판매전표에 넣으면
-- 재고가 없어 "재고가 부족합니다" 로 막히거나, 팔 때마다 재고가 음수 쪽으로 밀린다.
--
-- 기존 품목은 전부 수량관리대상이다 — 지금까지 그렇게 굴러왔으므로 그게 사실이다.
alter table items add column stock_tracked boolean;
update items set stock_tracked = true where stock_tracked is null;
alter table items alter column stock_tracked set not null;
alter table items alter column stock_tracked set default true;
