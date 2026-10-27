-- 품목등록(C000029) 품목구분에 원본의 [무형상품] 을 더한다(원재료 · 부재료 · 제품 · 반제품 · 상품 · 무형상품).
ALTER TABLE items DROP CONSTRAINT items_category_check;
ALTER TABLE items ADD CONSTRAINT items_category_check CHECK (category IN
    ('RAW_MATERIAL', 'SUB_MATERIAL', 'SEMI_FINISHED', 'FINISHED', 'MERCHANDISE', 'INTANGIBLE'));
