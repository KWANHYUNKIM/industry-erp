-- 근로계약현황(원본 E061104) [요청일시]: 근로계약을 발송한 때. 이미 발송 · 서명 · 해지된 계약은 마지막 수정 시각으로 채운다.
ALTER TABLE public.employment_contracts ADD COLUMN sent_at timestamp(6) without time zone;
UPDATE public.employment_contracts SET sent_at = coalesce(updated_at, created_at) WHERE status <> 'DRAFT';
