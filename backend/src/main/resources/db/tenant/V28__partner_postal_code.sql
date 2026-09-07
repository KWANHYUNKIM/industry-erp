-- 거래처의 [주소1 우편번호].
--
-- 원본 거래처등록 [기본] 탭의 항목이다(주소1 우편번호 · [주소검색] · 주소1).
-- 우리 거래처에는 주소 한 칸뿐이라 우편번호를 주소 안에 섞어 적어야 했다 —
-- 그러면 거래명세서·출하지시서에 우편번호만 따로 뽑을 수가 없다.
-- 출하지시서는 이미 우편번호 칸을 따로 들고 있다(shipments.postal_code).
alter table business_partners add column postal_code varchar(20);
