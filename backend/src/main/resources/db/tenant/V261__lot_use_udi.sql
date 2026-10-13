-- 원본 시리얼/로트No.등록(E040617) 의 [사용구분](사용 · 사용중단) 과 생성 창 [udi코드](2026-10-13 실측).
ALTER TABLE lots ADD COLUMN use_yn boolean NOT NULL DEFAULT true;
ALTER TABLE lots ADD COLUMN udi_code varchar(100);
