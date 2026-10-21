package com.erp.common.history.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;

public final class ChangeHistoryDtos {

    private ChangeHistoryDtos() {}

    /** 원본 '이력' 격자 한 줄 — [No.][작업자ID][작업일시][상태]. */
    /** docStatus 는 전표 [H] 의 [전표상태] · [진행상태] 칸(마스터 줄은 null). */
    public record ChangeHistoryResponse(int seq, String worker, LocalDateTime workedAt, String action, String docStatus) {}

    /** 거래이력조회(재고) E040716 한 줄 — 작업일자 · 전표번호 · 행위 · 거래처코드 · 거래처명 · 품목명 · 담당자코드 · 담당자명 · 작업자 · 전표상태 · 이력(H). */
    public record SlipHistoryResponse(Long id, String target, Long targetId, LocalDateTime workedAt, String menu,
                                      LocalDate docDate, String docNo, String action, String partnerCode, String partnerName,
                                      String itemSummary, String managerCode, String managerName, String worker, String docStatus) {}
}
