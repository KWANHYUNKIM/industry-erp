-- 토큰 회수(docs/보안-점검.md H6) — 사용자마다 토큰 버전. 로그아웃 · 비밀번호 변경 · 사용중지 때 +1 하고,
-- 토큰의 tv 클레임과 다르면 그 토큰은 401. 기존 사용자는 0 에서 시작한다.
ALTER TABLE users ADD COLUMN token_version integer NOT NULL DEFAULT 0;
