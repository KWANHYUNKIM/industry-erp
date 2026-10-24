-- 회계전표는 저장하면 곧 '확인' 이다 — loginaa 2026-10-13 실측: 영수증으로 26/10/13-3 을 저장하자 회계거래조회 [확인] 탭에 섰고
-- [미확인] 탭은 비어 있었다(회사의 다른 전표도 전부 확인). V329 가 미확인으로 깔았던 것을 바로잡는다.

ALTER TABLE journal_entries ALTER COLUMN confirm_status SET DEFAULT 'CONFIRMED';
UPDATE journal_entries SET confirm_status = 'CONFIRMED' WHERE confirm_status = 'UNCONFIRMED';
