package com.erp.common.history.dto;

import java.time.LocalDateTime;

public final class ChangeHistoryDtos {

    private ChangeHistoryDtos() {}

    /** 원본 '이력' 격자 한 줄 — [No.][작업자ID][작업일시][상태]. */
    public record ChangeHistoryResponse(int seq, String worker, LocalDateTime workedAt, String action) {}
}
