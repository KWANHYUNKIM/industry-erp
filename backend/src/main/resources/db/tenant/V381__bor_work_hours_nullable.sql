-- BOR 작업시간을 비워 저장할 수 있게 — 원본은 비워 두면 목록도 빈칸이다(2026-10-29 데이터이관 QA 79회:
-- P004 쥬스포장 1 · 열처리). 우리는 0 으로 채워 0 · 0.0000 · 00:00 을 찍었다. 이미 있는 0 은 그대로 둔다
-- (일부러 0 을 적었는지 비웠는지 모른다).
ALTER TABLE bor_operations ALTER COLUMN work_hours DROP DEFAULT;
ALTER TABLE bor_operations ALTER COLUMN work_hours DROP NOT NULL;
