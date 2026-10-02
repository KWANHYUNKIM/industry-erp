-- 작업내역에 [최초작성자] — 원본 작업내역조회·현황의 조건. 생산입고·생산불출(V227)과 같은 꼴:
-- 사용자명(자연키)에 FK, 개명은 따라가고(ON UPDATE CASCADE) 작성 이력이 있는 계정은 못 지운다(RESTRICT).
-- 지금까지 넣은 작업내역은 누가 넣었는지 모른다 — NULL 로 둔다.
ALTER TABLE public.work_results ADD COLUMN created_by varchar(50);
ALTER TABLE public.work_results
    ADD CONSTRAINT fk_work_results_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
        ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_work_results_created_by ON public.work_results (created_by);
