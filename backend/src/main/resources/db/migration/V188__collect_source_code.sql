-- 수집데이터등록의 [데이터코드]. 원본 조건 실측(사본):
-- 데이터코드 · 데이터명 · 수집대상 · 최초작성자 · 최종수정자 · 최초작성일자 · 최종작업일자.
--
-- 이름만으로 데이터원을 식별하고 있었다. 다른 마스터처럼 코드로도 부를 수 있게 한다.
-- 이미 있는 행에는 코드가 없으므로 nullable 이다.
--
-- [최초작성일자]·[최종작업일자]는 <b>마이그레이션이 필요 없다</b> — collect_sources 는
-- BaseTimeEntity 를 상속해 created_at·updated_at 을 이미 들고 있는데, 응답 record 에만
-- 안 실려서 화면이 <b>볼 수도 거를 수도</b> 없었다.
alter table collect_sources add column code varchar(20);
create index idx_collect_sources_code on collect_sources (code);
