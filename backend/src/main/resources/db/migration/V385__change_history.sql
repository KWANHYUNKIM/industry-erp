-- 공용 변경 이력 — 원본 마스터 수정 창의 [H](거래처등록 C000009 실측 2026-10-13): 이력 창에 No. · 작업자ID · 작업일시 · 상태(신규 · 수정 · 삭제 · 사용중단 · 재사용).
-- 어느 마스터든 같은 표에 (target_type, target_id) 로 쌓는다. 행을 지워도 이력은 남는다(FK 없음 — 원본도 지운 뒤 이력을 보여 준다).
CREATE TABLE change_history (
    id bigserial PRIMARY KEY,
    target_type varchar(40) NOT NULL,
    target_id bigint NOT NULL,
    action varchar(20) NOT NULL,
    actor varchar(50),
    created_at timestamp(6),
    updated_at timestamp(6),
    CONSTRAINT change_history_action_check CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'STOP', 'REUSE'))
);
CREATE INDEX idx_change_history_target ON change_history (target_type, target_id);
