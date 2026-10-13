-- 견적서 진행상태를 원본(견적서조회 E040202) 단계로 — 미확인 / 확인(진행중 · 완료).
-- 2026-10-14 loginaa 실측: [진행상태변경] 메뉴 '▾미확인 › 미확인', '▾확인 › 진행중 · 완료', 새 견적은 '진행중' 으로 저장된다.
-- 우리 작성 · 발송 · 수주전환은 원본에 없는 단계라 진행중으로 옮긴다(수주로 넘어간 것은 converted_order_id 가 따로 들고 있다).
-- 취소는 원본에 없지만 예전 자료가 있어 남긴다(주문서와 같다).
ALTER TABLE quotations DROP CONSTRAINT ck_quotations_status;
UPDATE quotations SET status = 'IN_PROGRESS' WHERE status IN ('DRAFT', 'SENT', 'CONVERTED');
ALTER TABLE quotations ALTER COLUMN status SET DEFAULT 'IN_PROGRESS';
ALTER TABLE quotations ADD CONSTRAINT ck_quotations_status
    CHECK (status IN ('UNCONFIRMED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'));
