-- V96: 남은 사람참조 정리 — 작성자 문자열에 FK, 휴가 상태를 enum 으로
--
-- 1) 작성자(author/writer) → users(username) FK
--    created_by 와 같은 이유다(V95). 다만 이번에는 셋뿐이다:
--      board_posts.author, notices.author, work_posts.writer  — 전부 로그인 사용자명이 그대로 들어간다.
--
--    FK 를 걸지 않은 사람참조도 있다. 그것들은 자유입력이라 계정이 없을 수 있어서다:
--      quality_inspections.inspector — 외부 검사원일 수 있다(요청값이 오면 그대로 쓴다)
--      work_results.worker           — 현장 작업자는 계정이 없다
--      business_partners.manager     — 거래처 쪽 담당자다. 우리 사용자가 아니다
--      projects.manager              — PM 이름. 사원 마스터와 별개로 자유입력이다
--    "이름을 담는 칸"과 "사용자를 가리키는 칸"은 다르다. 후자에만 FK 를 건다.
--
-- 2) vacation_requests.status: "대기"/"승인"/"반려" 문자열 → enum(PENDING/APPROVED/REJECTED)
--    오타를 막을 방법이 없었고, DB 에 무슨 값이 있는지 코드만 봐서는 알 수 없었다.
--    다른 모듈은 전부 enum + CHECK 다. 여기만 예외였다.

-- ── 1) 작성자 FK ────────────────────────────────────────────────────────────

-- 사용자 목록에 없는 작성자가 남아 있으면 FK 생성이 실패한다. 먼저 비운다(시스템 시드 등).
UPDATE public.board_posts SET author = NULL
 WHERE author IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = author);
UPDATE public.notices SET author = NULL
 WHERE author IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = author);
UPDATE public.work_posts SET writer = NULL
 WHERE writer IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.users u WHERE u.username = writer);

ALTER TABLE public.board_posts
    ADD CONSTRAINT fk_board_posts_author FOREIGN KEY (author) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_board_posts_author ON public.board_posts (author);

ALTER TABLE public.notices
    ADD CONSTRAINT fk_notices_author FOREIGN KEY (author) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_notices_author ON public.notices (author);

ALTER TABLE public.work_posts
    ADD CONSTRAINT fk_work_posts_writer FOREIGN KEY (writer) REFERENCES public.users(username)
    ON UPDATE CASCADE ON DELETE RESTRICT;
CREATE INDEX idx_work_posts_writer ON public.work_posts (writer);

-- ── 2) 휴가 상태 enum ───────────────────────────────────────────────────────

ALTER TABLE public.vacation_requests ALTER COLUMN status TYPE character varying(20);
ALTER TABLE public.vacation_requests ALTER COLUMN status DROP DEFAULT;

UPDATE public.vacation_requests SET status =
    CASE status
        WHEN '대기' THEN 'PENDING'
        WHEN '승인' THEN 'APPROVED'
        WHEN '반려' THEN 'REJECTED'
        ELSE status
    END;

-- 위 매핑에 없는 값이 남아 있으면 CHECK 에서 걸린다. 그게 맞다 — 무슨 값인지 모른 채
-- 아무 상태로 밀어 넣으면, 휴가가 승인됐는지 아닌지를 코드가 지어내는 셈이 된다.
ALTER TABLE public.vacation_requests
    ADD CONSTRAINT ck_vacation_requests_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED'));
ALTER TABLE public.vacation_requests ALTER COLUMN status SET DEFAULT 'PENDING';
