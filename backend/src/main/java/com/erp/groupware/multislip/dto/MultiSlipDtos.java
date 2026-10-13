package com.erp.groupware.multislip.dto;

import com.erp.groupware.multislip.MultiSlip;
import com.erp.groupware.multislip.MultiSlipBoard;
import com.erp.groupware.multislip.MultiSlipLine;
import com.erp.groupware.multislip.MultiSlipStatus;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

public final class MultiSlipDtos {

    private MultiSlipDtos() {}

    /** 저장 — 줄의 칸 값은 열 키 → 값. 첫 코드 칸이 빈 줄은 서버가 버린다. */
    public record SaveMultiSlipRequest(
            @NotNull MultiSlipBoard board,
            @NotNull LocalDate slipDate,
            List<Map<String, Object>> lines
    ) {}

    /** 원본 [진행상태변경 ▾ 진행중 · 완료] — 고른 전표 여럿. */
    public record ChangeMultiSlipStatusRequest(
            @NotEmpty List<Long> ids,
            @NotNull MultiSlipStatus status
    ) {}

    public record MultiSlipLineResponse(int lineNo, Map<String, Object> fields) {
        public static MultiSlipLineResponse from(MultiSlipLine l) {
            return new MultiSlipLineResponse(l.getLineNo(), l.getFields());
        }
    }

    public record MultiSlipResponse(
            Long id,
            MultiSlipBoard board,
            LocalDate slipDate,
            int slipNo,
            MultiSlipStatus status,
            String statusName,
            LocalDateTime createdAt,
            List<MultiSlipLineResponse> lines
    ) {
        public static MultiSlipResponse from(MultiSlip s) {
            return new MultiSlipResponse(s.getId(), s.getBoard(), s.getSlipDate(), s.getSlipNo(), s.getStatus(),
                    s.getStatus().getDisplayName(), s.getCreatedAt(),
                    s.getLines().stream().map(MultiSlipLineResponse::from).toList());
        }
    }
}
