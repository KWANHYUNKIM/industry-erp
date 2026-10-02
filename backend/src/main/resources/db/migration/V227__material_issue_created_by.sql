-- 생산불출에 [최초작성자] — 원본 생산불출현황의 조건·열. 생산입고(productions.created_by)와 같은 꼴:
-- 사용자명(자연키)에 FK, 개명은 따라가고(ON UPDATE CASCADE) 작성 이력이 있는 계정은 못 지운다(RESTRICT).
-- 지금까지 넣은 불출은 누가 넣었는지 모른다 — NULL 로 둔다.
ALTER TABLE public.material_issues ADD COLUMN created_by varchar(50);
ALTER TABLE public.material_issues
    ADD CONSTRAINT fk_material_issues_created_by FOREIGN KEY (created_by) REFERENCES public.users(username)
        ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_material_issues_created_by ON public.material_issues (created_by);
