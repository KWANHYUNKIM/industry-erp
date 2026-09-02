-- 품목의 구매처(주 매입처).
--
-- 원본 품목등록 리스트의 열 실측(사본 '품목등록 리스트'):
--   품목코드 · 품목명 · 이미지 · 구매처명 · 품목구분 · 규격정보 · 재고수량관리 ·
--   품목그룹1명 · 검색창내용 · 사용 · 파일관리
-- 우리 품목에는 구매처를 적을 자리가 아예 없어서, 같은 물건을 늘 어디서 사는지가
-- 사람 머릿속에만 있었다.
--
-- inventory 는 trade 를 참조할 수 없다(DAG). 그래서 @ManyToOne 이 아니라 평범한 bigint 이며,
-- 이름은 화면이 거래처 목록에서 붙인다 — warehouses.outsourcing_partner_id 와 같은 방식이다.
-- FK 는 건다(같은 스키마 안이라 무결성은 DB 가 지킬 수 있다).
ALTER TABLE items ADD COLUMN supplier_id bigint REFERENCES business_partners(id);

CREATE INDEX idx_items_supplier ON items (supplier_id);
