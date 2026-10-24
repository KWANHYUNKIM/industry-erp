-- 거래이력조회(재고) E040716 · 전표 수정 창 [H] — 원본은 전표마다 작업 이력(작업일자 · 전표번호 · 행위 · 거래처코드 · 거래처명 ·
-- 품목명 · 담당자코드 · 담당자명 · 작업자 · 전표상태 · 이력(H))을 남긴다. 지운 전표도 그 때 거래처 · 품목이 그대로 보이므로
-- (2026-10-21 loginaa 실측: 2026/10/21 -5 신규 → 수정 → 삭제 세 줄) 행위 때의 값을 글자로 박아 둔다(FK 없음 — common 은 다른 모듈을 모른다).
-- 마스터 [H] 줄은 이 칸들이 비어 있다(menu IS NULL).
ALTER TABLE change_histories ADD COLUMN menu varchar(30);
ALTER TABLE change_histories ADD COLUMN doc_date date;
ALTER TABLE change_histories ADD COLUMN doc_no varchar(40);
ALTER TABLE change_histories ADD COLUMN partner_code varchar(50);
ALTER TABLE change_histories ADD COLUMN partner_name varchar(200);
ALTER TABLE change_histories ADD COLUMN item_summary varchar(300);
ALTER TABLE change_histories ADD COLUMN manager_code varchar(50);
ALTER TABLE change_histories ADD COLUMN manager_name varchar(100);
ALTER TABLE change_histories ADD COLUMN doc_status varchar(20);
-- 거래이력조회는 작업일자 기간 + 메뉴로 찾는다.
CREATE INDEX idx_change_histories_menu_worked ON change_histories (menu, worked_at);
