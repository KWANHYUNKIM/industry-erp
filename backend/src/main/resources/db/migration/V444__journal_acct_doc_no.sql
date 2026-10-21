-- 일반전표 머리 [회계전표No.] — 사용자가 적는 글자 칸(전표번호와 따로 둔다, 원본 실측 2026-10-21: '77' 을 넣고 저장해도 전표는 26/10/21-29, 수정 창에 77 이 그대로).
ALTER TABLE journal_entries ADD COLUMN acct_doc_no varchar(50);
