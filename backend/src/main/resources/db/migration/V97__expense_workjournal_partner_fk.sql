-- V97: 비용·업무일지의 거래처 문자열에 FK 를 붙인다 (문자열은 그대로 둔다)
--
-- Expense.partnerName / WorkJournal.partnerName 은 자유입력이다. 마스터에 없는 상대에게도 돈은
-- 나가고, 업무일지에는 아직 등록 안 한 잠재 고객도 적힌다. 그래서 문자열을 없애지 않는다.
--
-- 대신 이름이 마스터와 **정확히 일치할 때만** partner_id 를 채운다. WorkResult.process 와
-- QualityInspection.lotNo 에서 이미 쓰는 패턴이다 — 자유입력을 허용하되, 마스터에 있으면 관계를 건다.
-- 부분일치로 엮으면 '한울' 이 '한울ICT' 에 붙는 식으로 엉뚱한 거래처가 달린다.

ALTER TABLE public.expenses      ADD COLUMN partner_id bigint;
ALTER TABLE public.work_journals ADD COLUMN partner_id bigint;

-- 기존 행 백필: 이름이 정확히 일치하는 것만
UPDATE public.expenses e
   SET partner_id = p.id
  FROM public.business_partners p
 WHERE e.partner_name IS NOT NULL AND btrim(e.partner_name) = p.name;

UPDATE public.work_journals w
   SET partner_id = p.id
  FROM public.business_partners p
 WHERE w.partner_name IS NOT NULL AND btrim(w.partner_name) = p.name;

ALTER TABLE public.expenses
    ADD CONSTRAINT fk_expenses_partner_id FOREIGN KEY (partner_id) REFERENCES public.business_partners(id);
CREATE INDEX idx_expenses_partner_id ON public.expenses (partner_id);

ALTER TABLE public.work_journals
    ADD CONSTRAINT fk_work_journals_partner_id FOREIGN KEY (partner_id) REFERENCES public.business_partners(id);
CREATE INDEX idx_work_journals_partner_id ON public.work_journals (partner_id);
