-- 창고이동을 여러 줄 전표로 (원본 창고이동입력 E040501 · 창고이동조회 E040502).
-- 원본은 전표 한 장(일자 · 담당자 · 보내는창고 · 받는창고 · 프로젝트)에 품목 여러 줄이고 수정할 수 있다.
-- 우리는 한 줄이 한 이동이었다. 줄 테이블(stock_transfers)은 그대로 두고, 같은 이동번호(transfer_no)를
-- 여러 줄이 나눠 들게 한다 — 이동번호 + 줄번호가 한 줄이다. 재고 이동 기록(stock_transactions)은 그대로 쓴다.
-- 기존 자료는 한 줄짜리 전표(줄번호 1)가 된다.
alter table stock_transfers drop constraint ukds2ppmw92ulvs2emeulb9ijiy;
alter table stock_transfers add column line_no integer;
update stock_transfers set line_no = 1 where line_no is null;
alter table stock_transfers alter column line_no set not null;
alter table stock_transfers add constraint uk_stock_transfers_no_line unique (transfer_no, line_no);
