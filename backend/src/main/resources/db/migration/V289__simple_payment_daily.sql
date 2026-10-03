-- 지급명세서(일용직) — 원본 E020146 '일용근로지급명세서파일생성' 은 간이지급명세서와 같은 한 장(지급연월 · 신고일자 · 담당자 · 제출자)이고
-- 자료구분이 '일용근로소득' 하나다. 같은 테이블에 자료구분 DAILY 를 더한다(2026-10-04 실측).
ALTER TABLE simple_payment_statements DROP CONSTRAINT simple_payment_statements_kind_check;
ALTER TABLE simple_payment_statements ADD CONSTRAINT simple_payment_statements_kind_check
    CHECK (kind IN ('LABOR', 'BUSINESS', 'OTHER', 'DAILY'));
