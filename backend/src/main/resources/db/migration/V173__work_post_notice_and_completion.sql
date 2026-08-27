-- WORK 게시글의 공지사항여부 · 참조자 · 완료일시.
--
-- 원본 WORK입력 폼 실측(사본 'WORK'): 완료일시 · 전달자 · 참조자 · 권한 · 비밀번호 ·
-- 게시글비밀번호 · 제목 · 공지사항여부 · 첨부.
-- 우리 폼에는 제목·내용·전달자·첨부밖에 없었다. 그래서
--   * 공지로 올릴 방법이 없어 중요한 글이 그냥 날짜순으로 밀려 내려갔고,
--   * 언제 끝난 일인지가 아무 데도 안 남았다 — 진행상태는 '완료' 라고만 말한다.
-- 완료일시는 원본 피커가 년/월/일 + 시:분이라 timestamp 다.
ALTER TABLE work_posts ADD COLUMN notice boolean;
UPDATE work_posts SET notice = false WHERE notice IS NULL;
ALTER TABLE work_posts ALTER COLUMN notice SET NOT NULL;

ALTER TABLE work_posts ADD COLUMN cc_to varchar(200);

ALTER TABLE work_posts ADD COLUMN completed_at timestamp;

-- 이미 완료로 표시된 글은 언제 끝났는지 알 길이 없다. 마지막 수정시각을 쓴다 —
-- 상태를 완료로 바꾼 것이 그 글의 마지막 손질인 경우가 대부분이고, 비워 두면
-- '완료인데 완료일시가 없는' 줄이 영영 남는다.
UPDATE work_posts SET completed_at = updated_at WHERE status = 'DONE' AND completed_at IS NULL;
