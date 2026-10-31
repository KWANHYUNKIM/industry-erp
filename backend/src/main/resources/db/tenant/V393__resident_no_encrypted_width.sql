-- 주민등록번호 암호화 보관(개인정보 보호법 제24조의2, docs/보안-점검.md H3). 값은 앱이 AES-GCM 으로 암호화해
-- 'enc:v1:' + base64 로 적는다(common/crypto/PiiCipher) — 평문 13~14자보다 길어 칸을 넓힌다.
-- 기존 평문 행은 기동 때 PiiEncryptionBackfill 이 암호화한다(키가 SQL 에 들어가지 않게 앱에서).
ALTER TABLE employees ALTER COLUMN resident_no TYPE varchar(100);
ALTER TABLE insurance_reports ALTER COLUMN resident_no TYPE varchar(100);
