-- A/S 접수의 [제목]·[수리예정일자]. 원본 A/S접수입력 필드 실측(사본):
-- 일자 · 거래처 · 담당자 · 창고 · 접수진행상태 · 수리예정일자 · 제목 · 프로젝트.
--
-- 우리 전표에는 [증상] 만 있어서, 목록에서 한 건이 무슨 일인지 알려면 증상 전문을 읽어야 했고
-- "언제까지 고쳐 주기로 했나" 는 아예 적을 데가 없었다(완료일은 끝난 뒤에야 생긴다).
-- 둘 다 접수 시점에 비어 있을 수 있으므로 nullable 이다.
alter table as_requests add column title varchar(200);
alter table as_requests add column scheduled_date date;
