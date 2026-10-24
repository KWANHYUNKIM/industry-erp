-- 수령(발행)수표내역입력(분개 없이 넣은 수표)의 [일자-No.] — 원본은 수표 전표 자체 번호다(2026-10-13 loginaa 실측:
-- 수령은 같은 날 -5 · -6 · -7 … 증가 · 감소 전표가 한 번호 줄을 나눠 쓰고, 지운 번호(-1 ~ -4)는 다시 주지 않는다.
-- 발행은 따로 -1 부터. 한 전표의 여러 줄은 같은 번호).
ALTER TABLE bank_checks ADD COLUMN direct_in_no integer;
ALTER TABLE bank_checks ADD COLUMN direct_out_no integer;

-- 지운 번호를 다시 주지 않으려고 (수표 종류, 날짜) 마다 마지막 번호를 따로 들고 있는다(max + 1 이면 맨 끝을 지웠을 때 재사용된다).
CREATE TABLE check_entry_counters (
    check_type varchar(20) NOT NULL,
    entry_date date NOT NULL,
    last_no integer NOT NULL,
    PRIMARY KEY (check_type, entry_date)
);
