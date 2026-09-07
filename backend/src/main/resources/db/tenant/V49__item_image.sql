-- 품목 이미지.
--
-- 원본 품목등록 리스트 열 실측(사본): 품목코드 · 품목명 · <b>이미지</b> · 구매처명 ·
-- 품목구분 · 규격정보 · 재고수량관리 · 품목그룹1명 · 검색창내용 · 사용 · <b>파일관리</b>.
-- 우리에겐 품목에 그림을 붙일 자리가 없었다 — 비슷하게 생긴 부품이 수십 개인데
-- 코드와 이름만으로 고르게 하고 있었다.
--
-- 파일 자체는 이미 stored_files 가 들고 있다(기안서 첨부·ECDrive 와 같은 저장소).
-- 여기서는 그중 한 건을 가리킨다.
ALTER TABLE items ADD COLUMN image_file_id bigint REFERENCES stored_files(id);

CREATE INDEX idx_items_image_file ON items (image_file_id);
