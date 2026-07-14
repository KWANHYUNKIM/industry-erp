-- V43: 받을수표(104) 계정과목
--
-- 수표 분개가 이 계정을 쓴다. DataInitializer 에도 넣어 두었지만 그건 앱이 새로 뜰 때만 돌고
-- 이미 뜬 환경에는 반영되지 않으므로, 스키마와 함께 확정적으로 넣는다.

INSERT INTO public.accounts (code, name, division, detail_category, active)
VALUES ('104', '받을수표', 'ASSET', '유동자산', true);
