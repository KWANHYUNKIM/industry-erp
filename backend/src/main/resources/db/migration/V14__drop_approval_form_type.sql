-- V14: approval_documents.form_type 제거
--
-- V13 에서 form_template_id 로 백필을 끝냈고(NULL 0건 확인), 코드도 양식 마스터를 쓰도록 바꿨다.
-- enum 문자열 컬럼을 남겨두면 양식 마스터와 진실이 둘로 갈린다.
--
-- ApprovalFormType enum 클래스도 함께 삭제했다. 응답 DTO 의 formType 필드는
-- 이제 양식 마스터의 code(값이 동일)를 그대로 내려주므로 프론트는 영향받지 않는다.

ALTER TABLE public.approval_documents DROP COLUMN form_type;
