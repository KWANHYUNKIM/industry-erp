package com.erp.dto;

import com.erp.domain.FieldWork;
import com.erp.domain.enums.FieldWorkStatus;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public final class FieldWorkDtos {

    private FieldWorkDtos() {}

    public record CreateFieldWorkRequest(
            @NotNull(message = "외근일을 입력하세요.") LocalDate workDate,
            LocalTime startTime,
            LocalTime endTime,
            @NotBlank(message = "외근지를 입력하세요.") String destination,
            @NotBlank(message = "외근 사유를 입력하세요.") String purpose
    ) {}

    public record RejectRequest(
            @NotBlank(message = "반려 사유를 입력하세요.") String reason
    ) {}

    public record FieldWorkResponse(
            Long id,
            Long userId, String userName, String department,
            LocalDate workDate, LocalTime startTime, LocalTime endTime,
            String destination, String purpose,
            FieldWorkStatus status, String statusName,
            String approverName, String rejectReason
    ) {
        public static FieldWorkResponse from(FieldWork f) {
            return new FieldWorkResponse(
                    f.getId(),
                    f.getUser().getId(), f.getUser().getName(), f.getUser().getDepartment(),
                    f.getWorkDate(), f.getStartTime(), f.getEndTime(),
                    f.getDestination(), f.getPurpose(),
                    f.getStatus(), f.getStatus().getDisplayName(),
                    f.getApprover() != null ? f.getApprover().getName() : null,
                    f.getRejectReason());
        }
    }

    /** 외근조회: 기간 내 외근계와 상태별 건수 */
    public record FieldWorkSummary(
            long requestedCount,
            long approvedCount,
            long rejectedCount,
            List<FieldWorkResponse> rows
    ) {}
}
