-- 근로계약서진행단계(원본 C061103) 계약서입력 모델: 계약서명 · 첨부(PDF 필수) · 2차인증사용여부 · 구분 · 부서 · 프로젝트 · 전달메시지,
-- 수신정보입력의 계약참여자1(사원) · 전달방식. 계약서를 먼저 만들고 받는 사원은 나중에 고르므로 사원 · 계약유형은 비워 둘 수 있다.
ALTER TABLE public.employment_contracts ADD COLUMN contract_name varchar(100);
ALTER TABLE public.employment_contracts ADD COLUMN attachment_file_id bigint REFERENCES public.stored_files(id);
ALTER TABLE public.employment_contracts ADD COLUMN two_factor boolean NOT NULL DEFAULT false;
ALTER TABLE public.employment_contracts ADD COLUMN category varchar(50);
ALTER TABLE public.employment_contracts ADD COLUMN project_id bigint REFERENCES public.projects(id);
ALTER TABLE public.employment_contracts ADD COLUMN delivery_method varchar(20);
ALTER TABLE public.employment_contracts ADD CONSTRAINT ck_employment_contracts_delivery_method
    CHECK (delivery_method IN ('EMAIL', 'SMS', 'KAKAO', 'DIRECT'));
ALTER TABLE public.employment_contracts ALTER COLUMN employee_id DROP NOT NULL;
ALTER TABLE public.employment_contracts ALTER COLUMN type DROP NOT NULL;
CREATE INDEX idx_employment_contracts_attachment_file_id ON public.employment_contracts (attachment_file_id);
CREATE INDEX idx_employment_contracts_project_id ON public.employment_contracts (project_id);
