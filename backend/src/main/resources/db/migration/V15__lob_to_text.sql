-- V15: @Lob 으로 oid(large object) 에 저장되던 본문을 text 컬럼으로 옮긴다
--
-- 배경: JPA 의 @Lob + String 은 PostgreSQL 에서 varchar/text 가 아니라 oid 로 매핑된다.
--       본문이 테이블 밖(pg_largeobject)에 저장되므로
--         (1) 행을 DELETE 해도 large object 는 남는다 — 실제로 9개 행에 LO 15개가 물려 있었다.
--         (2) pg_dump 가 lo_create 를 뿜고, 복제/이관이 번거로워진다.
--         (3) SELECT 로 본문을 바로 읽을 수 없다.
--
-- 대상: approval_documents.content, work_journals.content, work_posts.content
--
-- 순서: text 컬럼에 복사 → large object 해제 → oid 컬럼 제거 → 이름 되돌리기.
-- 복사 전에 unlink 하면 본문이 사라지므로 순서를 지킨다.

-- ── approval_documents ────────────────────────────────────────────────
ALTER TABLE public.approval_documents ADD COLUMN content_text text;
UPDATE public.approval_documents
   SET content_text = convert_from(lo_get(content), 'UTF8')
 WHERE content IS NOT NULL;
UPDATE public.approval_documents SET content_text = '' WHERE content_text IS NULL;
SELECT lo_unlink(content) FROM public.approval_documents WHERE content IS NOT NULL;
ALTER TABLE public.approval_documents DROP COLUMN content;
ALTER TABLE public.approval_documents RENAME COLUMN content_text TO content;
ALTER TABLE public.approval_documents ALTER COLUMN content SET NOT NULL;

-- ── work_journals ─────────────────────────────────────────────────────
ALTER TABLE public.work_journals ADD COLUMN content_text text;
UPDATE public.work_journals
   SET content_text = convert_from(lo_get(content), 'UTF8')
 WHERE content IS NOT NULL;
UPDATE public.work_journals SET content_text = '' WHERE content_text IS NULL;
SELECT lo_unlink(content) FROM public.work_journals WHERE content IS NOT NULL;
ALTER TABLE public.work_journals DROP COLUMN content;
ALTER TABLE public.work_journals RENAME COLUMN content_text TO content;
ALTER TABLE public.work_journals ALTER COLUMN content SET NOT NULL;

-- ── work_posts ────────────────────────────────────────────────────────
ALTER TABLE public.work_posts ADD COLUMN content_text text;
UPDATE public.work_posts
   SET content_text = convert_from(lo_get(content), 'UTF8')
 WHERE content IS NOT NULL;
UPDATE public.work_posts SET content_text = '' WHERE content_text IS NULL;
SELECT lo_unlink(content) FROM public.work_posts WHERE content IS NOT NULL;
ALTER TABLE public.work_posts DROP COLUMN content;
ALTER TABLE public.work_posts RENAME COLUMN content_text TO content;
ALTER TABLE public.work_posts ALTER COLUMN content SET NOT NULL;

-- ── 고아 large object 정리 ────────────────────────────────────────────
-- 위 세 컬럼이 유일한 oid 컬럼이었다(information_schema 로 확인).
-- 그러므로 여기 남은 large object 는 전부 예전에 지워진 행이 흘린 고아다.
SELECT lo_unlink(oid) FROM pg_largeobject_metadata;
