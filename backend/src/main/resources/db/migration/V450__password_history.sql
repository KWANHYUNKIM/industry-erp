-- 보안설정 로그인관리 '동일 비밀번호 사용제한' (원본 C001138: 5회) — 최근 비밀번호 해시를 남기고, 정책 칸을 더한다.
ALTER TABLE security_policy ADD COLUMN pw_history_count integer DEFAULT 5 NOT NULL;

CREATE TABLE password_histories (
    id bigserial PRIMARY KEY,
    created_at timestamp(6) without time zone,
    updated_at timestamp(6) without time zone,
    user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    password_hash varchar(100) NOT NULL
);
CREATE INDEX idx_password_histories_user ON password_histories (user_id);
