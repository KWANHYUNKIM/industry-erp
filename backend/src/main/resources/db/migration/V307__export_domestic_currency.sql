-- 원본 Invoice/Packing List 입력의 [통화] 기본값은 '내자'(원화, 2026-10-12 실측)다. 통화 마스터에는 외화만 있으므로
-- 내자 인보이스는 통화가 비어 있다 — 금액이 곧 원화이고 목록 [Foreign Currency] 칸도 비어 보인다.
ALTER TABLE export_orders ALTER COLUMN currency_id DROP NOT NULL;
