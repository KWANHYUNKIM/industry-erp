-- 회계 II > 채권감소등록 [입금보고서작성] 수금형태 '수표' · 채무감소등록 [지출결의서작성] 지급형태 '수표' (2026-10-14 loginaa 실측).
-- 입금보고서(지출결의서)를 저장하면 채권(채무) 감소와 함께 수령(발행)수표가 하나씩 늘고, 수표조회 증가 줄의 거래유형은
-- '입금보고서'('지출결의서') · [회계전표일자-No.] 는 그 전표다. 그 전표를 지우면 수표 증가 줄도 사라진다(원본과 같다 —
-- bond_entries.source_voucher_id 와 같은 방식).
ALTER TABLE bank_checks ADD COLUMN source_voucher_id bigint REFERENCES fast_vouchers(id) ON DELETE CASCADE;
CREATE INDEX idx_bank_checks_source_voucher_id ON bank_checks (source_voucher_id);
