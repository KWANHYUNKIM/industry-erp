-- 발주요청 · 발주계획은 머리 거래처를 비워도 저장된다(원본 E040315 실측). 발주서 · 단가요청은 서비스가 막는다.
ALTER TABLE purchase_orders ALTER COLUMN partner_id DROP NOT NULL;
