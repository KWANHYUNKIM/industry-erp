-- 자가사용입력(원본 재고 I › 기타이동 › 자가사용 › 자가사용입력 E040503, 2026-10-12 loginaa 실측).
--
-- 원본은 머리 [일자 · 거래처 · 담당자 · 창고 · 프로젝트] 아래 격자에 품목을 여러 줄 넣어 전표 한 장으로 저장한다
-- (자가사용조회에 '투광등 100W 외 1건' · 수량은 줄 합으로 한 줄). 우리 기타이동은 한 줄 = 한 전표라
-- adjust_no 가 유일했다. 같은 전표번호를 여러 줄이 나눠 들도록 [줄번호]를 더하고 유일 제약을 (번호, 줄) 로 바꾼다.
-- 이미 있는 전표는 모두 한 줄짜리라 1 로 채운다.
alter table stock_adjustments add column line_no integer;
update stock_adjustments set line_no = 1 where line_no is null;
alter table stock_adjustments alter column line_no set not null;
-- 한 줄짜리를 만드는 다른 화면(재고조정 · 단계별재고조정 …)은 줄번호를 모른다 — 1 이 기본이다.
alter table stock_adjustments alter column line_no set default 1;
alter table stock_adjustments drop constraint uk_stock_adjustments_adjust_no;
alter table stock_adjustments add constraint uk_stock_adjustments_adjust_no_line unique (adjust_no, line_no);

-- 원본 머리 [거래처](자가사용조회의 [거래처] 열 · 조건). inventory 는 trade 를 참조할 수 없어 엔티티는 id 만 든다
-- (담당자 employee_id 와 같은 방식). DB 는 FK 로 묶어 없는 거래처를 막는다.
alter table stock_adjustments add column partner_id bigint;
alter table stock_adjustments add constraint fk_stock_adjustments_partner
  foreign key (partner_id) references business_partners (id);
create index idx_stock_adjustments_partner on stock_adjustments (partner_id);
