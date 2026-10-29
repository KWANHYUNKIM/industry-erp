-- 기본값설정(C001124) 0값표시 · 12/24시간제 · 인쇄정렬 · 인쇄방향 — 원본 기본값(표시안함 · 12시간제 · 가운데 · 세로)
ALTER TABLE preference ADD COLUMN zero_display boolean NOT NULL DEFAULT false;
ALTER TABLE preference ADD COLUMN clock24 boolean NOT NULL DEFAULT false;
ALTER TABLE preference ADD COLUMN print_align varchar(6) NOT NULL DEFAULT 'CENTER';
ALTER TABLE preference ADD COLUMN print_orientation varchar(9) NOT NULL DEFAULT 'PORTRAIT';
