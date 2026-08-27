-- 수금·지급(결제) 전표의 회계반영.
--
-- 원본 결제내역조회에 [미반영 · 회계반영 · 강제회계반영] 탭과 [회계전표] 열이 있다.
-- 결제 전표도 회계로 넘어간다는 뜻이다.
--
-- 우리는 넘기지 않았다. JournalSourceType 에 결제가 아예 없고 JournalService 에도
-- 만드는 곳이 없다. 그래서 <b>판매하면 외상매출금이 잡히는데 수금해도 안 줄었다.</b>
-- 회계 원장의 외상매출금이 한 방향으로만 쌓인다. 채권현황은 따로 세니까 맞고,
-- 어긋난 것은 원장뿐이라 결산할 때까지 아무도 모른다.
--
-- source_type 은 CHECK 로 값을 묶어 뒀다. enum 에 상수를 늘리면서 이 제약을 빠뜨리면
-- 기동은 멀쩡하고 그 값을 처음 저장할 때 23514 로 터진다(CLAUDE.md 의 그 함정).

ALTER TABLE settlements ADD COLUMN accounting_reflected boolean;
UPDATE settlements SET accounting_reflected = false WHERE accounting_reflected IS NULL;
ALTER TABLE settlements ALTER COLUMN accounting_reflected SET NOT NULL;

ALTER TABLE journal_entries DROP CONSTRAINT ck_journal_entries_source_type;
ALTER TABLE journal_entries ADD CONSTRAINT ck_journal_entries_source_type
    CHECK (source_type IN ('SALES','PURCHASE','EXPENSE','BANK','CARD','NOTE',
                           'DEPRECIATION','DISPOSAL','VOUCHER','NONCASH','CHECK',
                           'PAYROLL','ACCOUNT_TRANSFER','CARD_PAYMENT','SETTLEMENT','MANUAL'));
