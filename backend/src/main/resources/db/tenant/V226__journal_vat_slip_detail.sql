-- 매출전표 I · 매입전표 I 의 나머지 칸과 회계전표 최종수정자 (2026-10-13 loginaa 실측).
-- [부가세유형 세금계산서] 아래 [전자종류](종이(세금)계산서 · 전자(세금)계산서-신규 · 기재사항착오정정 · 공급가액변동 · 환입 ·
-- 계약의해제 · 내국신용장개설 · 착오에의한이중발행, 기본 전자(세금)계산서-신규) · [예정누락분](예정누락아님 · 예정누락).
-- 매출전표 I [세부내역] 창(세금계산서내역등록): 일련번호 · 청구/영수 · 비고 · 현금 · 수표 · 어음 · 외상매출금 + 월/일 · 품명 · 규격 ·
-- 수량 · 단가 · 공급가액 · 부가세 · 비고 격자 — 한 덩어리로만 읽고 쓰므로 JSON 글자로 든다.
-- 회계거래조회 조건 [최종수정자] — 고친 사람(updated_by). 기존 전표는 만든 사람이 마지막으로 고친 사람이다.

ALTER TABLE journal_entries ADD COLUMN e_invoice_kind varchar(30);
ALTER TABLE journal_entries ADD COLUMN vat_omitted boolean;
UPDATE journal_entries SET vat_omitted = false WHERE vat_omitted IS NULL;
ALTER TABLE journal_entries ALTER COLUMN vat_omitted SET NOT NULL;
ALTER TABLE journal_entries ALTER COLUMN vat_omitted SET DEFAULT false;
ALTER TABLE journal_entries ADD COLUMN vat_detail text;
ALTER TABLE journal_entries ADD COLUMN updated_by varchar(50);
UPDATE journal_entries SET updated_by = created_by WHERE updated_by IS NULL;
