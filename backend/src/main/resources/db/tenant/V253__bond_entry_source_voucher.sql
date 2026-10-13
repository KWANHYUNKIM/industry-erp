-- 회계 II > 채권관리 > 채권감소등록 [입금보고서작성] — 입금보고서를 저장하면 회계전표와 함께 채권 감소가 생기고, 그 감소는 입금보고서를 가리킨다
-- (원본 채권조회 [출처업무] '입금보고서' · [회계일자-No.], 2026-10-13 loginaa 실측). 입금보고서를 지우면 감소도 사라진다(원본과 같다).
ALTER TABLE bond_entries ADD COLUMN source_voucher_id bigint REFERENCES fast_vouchers(id) ON DELETE CASCADE;
CREATE INDEX idx_bond_entries_source_voucher_id ON bond_entries (source_voucher_id);
