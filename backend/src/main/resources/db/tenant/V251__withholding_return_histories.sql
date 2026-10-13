-- 원천징수이행상황신고서 목록의 [이력] — 원본 '원천징수이행상황신고서 이력' 창(순번 · 작업자ID · 작업일시 · 신고서종류 · 상태).
-- 우리는 신고서를 언제 누가 만들고 고쳤는지 남기지 않아 [이력] 열을 둘 수 없었다(2026-10-13 loginaa 실측: 신규 → '원천징수이행상황신고서 정보 · 신규').
-- 신고서를 지우면 이력도 같이 지운다(원본도 목록에서 사라진 신고서의 이력은 볼 곳이 없다).
-- FK 컬럼에는 인덱스를 직접 만든다(CLAUDE.md 7.1).
CREATE TABLE withholding_return_histories (
    id          bigserial    PRIMARY KEY,
    return_id   bigint       NOT NULL,
    changed_at  timestamp    NOT NULL,
    changed_by  varchar(50),
    kind        varchar(50)  NOT NULL,
    action      varchar(10)  NOT NULL,
    CONSTRAINT fk_withholding_return_histories_return FOREIGN KEY (return_id)
        REFERENCES withholding_returns(id) ON DELETE CASCADE
);
CREATE INDEX idx_withholding_return_histories_return ON withholding_return_histories(return_id);
