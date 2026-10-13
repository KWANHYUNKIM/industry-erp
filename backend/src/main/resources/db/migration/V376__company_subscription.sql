-- 회사(테넌트) 단위 사용 조건 — 사용자 수 한도 · 사용기한.
-- companies 는 본사(public)에만 있는 레지스트리라 db/tenant 쪽 짝은 없다.
-- 둘 다 비어 있으면 제한 없음(기존 회사는 그대로 쓴다).
ALTER TABLE companies ADD COLUMN max_users integer;
ALTER TABLE companies ADD COLUMN expires_on date;
ALTER TABLE companies ADD CONSTRAINT companies_max_users_check CHECK (max_users IS NULL OR max_users > 0);
