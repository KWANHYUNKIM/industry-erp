-- 수령수표입금처리(E060602) [입금보고서작성] 으로 손을 떠난 수표는 그 입금보고서(회계 I 간편전표)의 회계전표를 가리킨다(settle_journal_id).
--
-- 원본(2026-10-13 loginaa 실측): 그 입금보고서를 지우면 수령수표조회의 감소 줄이 사라지고 수표가 다시 입금처리 목록에 보인다.
-- 입금보고서는 회계거래조회 · 입금보고서 화면 어디서 지워도 같은데, 그쪽 삭제 경로(간편전표)는 수표를 모른다 —
-- 그래서 회계전표가 지워지기 직전에 그 전표를 가리키는 수표를 보유로 되돌린다. 이것이 없으면 settle_journal_id 의 FK 때문에
-- 입금보고서 삭제가 23503 으로 막힌다.
--
-- 분개로 받은 수표(direct_entry = false)는 입금할 때 입금계좌를 수표에 적으므로 그것도 지운다. 수표내역입력으로 넣은 수표는
-- 수표계좌를 그대로 둔다(BankCheckService.deleteMoves 와 같다).

CREATE FUNCTION bank_checks_release_settle_journal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE bank_checks
       SET status = 'HELD',
           settled_date = NULL,
           settle_journal_id = NULL,
           direct_out_no = NULL,
           bank_account_id = CASE WHEN direct_entry OR type = 'ISSUED' THEN bank_account_id ELSE NULL END
     WHERE settle_journal_id = OLD.id;
    RETURN OLD;
END
$$;

CREATE TRIGGER trg_bank_checks_release_settle_journal
    BEFORE DELETE ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION bank_checks_release_settle_journal();
