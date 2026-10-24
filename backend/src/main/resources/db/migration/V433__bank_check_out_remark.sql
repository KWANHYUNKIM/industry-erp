-- 수표 감소 줄의 적요(원본 수령수표입금처리 · 발행수표출금처리 펼침 [수표만감소] 창 '적요: 증가적요동일 · 수표번호 · 직접입력',
-- 2026-10-21 loginaa 실측). 비면 증가 적요(remark)를 그대로 보인다.
ALTER TABLE bank_checks ADD COLUMN out_remark varchar(200);
