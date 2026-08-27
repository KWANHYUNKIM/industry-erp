-- 로그인 계정 ↔ 사원 마스터 연결.
--
-- 원본 근태현황의 열은 전표일자 · 근태일자 · 부서명 · 직급 · 사원번호 · 사원명 ·
-- 근태종류 · 적요다. 우리 근태는 User 에 매달려 있는데 User 에는 직급도 사원번호도 없고,
-- 부서는 자유입력 문자열이라 부서 마스터와 맞는다는 보장조차 없었다.
-- 그래서 그 세 칸을 아예 만들지 못했다.
--
-- 연결은 <b>선택</b>이다. 사원으로 등록되지 않은 계정(시스템 관리자 등)이 있고,
-- 안 이은 계정은 예전처럼 User 의 자유입력 부서를 쓴다.
alter table users add column employee_id bigint;

alter table users
    add constraint fk_users_employee
    foreign key (employee_id) references employees (id);

-- PostgreSQL 은 FK 를 만들어도 참조하는 쪽 컬럼에 인덱스를 만들지 않는다.
create index idx_users_employee on users (employee_id);
