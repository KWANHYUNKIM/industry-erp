-- 받을어음일괄감소(E010621) [입금보고서작성] · 지급어음일괄감소(E010629) [지출결의서작성] 으로 닫힌 어음은
-- 그 입금보고서 · 지출결의서(회계 I 간편전표)의 회계전표를 가리킨다(close_journal_entry_id).
--
-- 결의서는 회계거래조회 · 입금보고서 · 지출결의서 화면 어디서든 지울 수 있고, 그쪽 삭제 경로(간편전표)는 어음을 모른다.
-- 그래서 회계전표가 지워지기 직전에 그 전표로 닫힌 어음을 보유로 되돌린다(수표의 V392 와 같은 자리).
-- 받을어음감소 · 거래처지급의 지우기는 어음에서 전표를 먼저 떼므로 이 트리거에 걸리지 않는다.

CREATE FUNCTION promissory_notes_release_close_journal() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    UPDATE promissory_notes
       SET status = 'HELD',
           closed_date = NULL,
           discount_fee = NULL,
           close_remark = NULL,
           close_department_id = NULL,
           close_project_id = NULL,
           close_partner_id = NULL,
           close_journal_entry_id = NULL
     WHERE close_journal_entry_id = OLD.id;
    RETURN OLD;
END
$$;

CREATE TRIGGER trg_promissory_notes_release_close_journal
    BEFORE DELETE ON journal_entries
    FOR EACH ROW EXECUTE FUNCTION promissory_notes_release_close_journal();
