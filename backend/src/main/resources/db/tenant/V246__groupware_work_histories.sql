-- 그룹웨어 [H] '이력' 창 — 일정관리(E070201) · 공용품관리(E070204) 조회 창 하단 [H] (2026-10-13 loginaa 실측):
--   '[2026/10/13 -4]', 격자 [순번][작업자ID][작업일시][상태] — 저장할 때마다 한 줄(신규 → 수정 → 수정 …).
--   대상 자료를 지우면 이력도 볼 길이 없으니 FK 없이 (target, target_id) 로만 묶는다.
CREATE TABLE groupware_work_histories (
    id bigserial PRIMARY KEY,
    target varchar(30) NOT NULL,
    target_id bigint NOT NULL,
    action varchar(10) NOT NULL,
    worker varchar(50),
    worked_at timestamp NOT NULL
);
CREATE INDEX idx_groupware_work_histories_target ON groupware_work_histories (target, target_id);
