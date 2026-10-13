-- V385(테넌트 V257) change_history 는 초안이 커밋 전에 다른 작업자의 재기동으로 적용돼 버린 것이다(비어 있고 아무 엔티티도 안 쓴다) — 지운다.
DROP TABLE change_history;
-- 공용 변경 이력 — 그룹웨어 [H] 이력 표(V373 groupware_work_histories)를 모든 마스터가 같이 쓰도록 common 으로 옮긴다.
-- 원본 수정 · 조회 창 [H] '이력'(거래처등록 C000009 · 일정관리 E070201 · 공용품관리 E070204, 2026-10-13 실측)은 어느 화면이든
-- 같은 창이다: [No.][작업자ID][작업일시][상태 신규 · 수정 · 삭제 · 사용중단 · 재사용]. 표 모양은 그대로 두고 이름만 바꾼다.
ALTER TABLE groupware_work_histories RENAME TO change_histories;
ALTER TABLE change_histories RENAME CONSTRAINT groupware_work_histories_pkey TO change_histories_pkey;
ALTER SEQUENCE groupware_work_histories_id_seq RENAME TO change_histories_id_seq;
ALTER INDEX idx_groupware_work_histories_target RENAME TO idx_change_histories_target;
