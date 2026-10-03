package com.erp.groupware.fieldwork.dto;

import com.erp.groupware.fieldwork.FieldWork;
import com.erp.groupware.fieldwork.FieldWorkStatus;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;

public final class FieldWorkDtos {

    private FieldWorkDtos() {}

    /**
     * 원본 외근입력(E070254) — 일자 · 이동시간 · 사용자 · 이동수단 · 사용목적명 · 출발지/도착지 주소 · 적요.
     * 필수는 <b>사용자 · 이동수단</b>이다(빈 채로 저장하면 그 둘만 빨개진다, 2026-10-03 실측).
     * 사용자를 안 주면 로그인한 사람이다.
     */
    public record CreateFieldWorkRequest(
            @NotNull(message = "일자를 입력하세요.") LocalDate workDate,
            LocalTime startTime,
            LocalTime endTime,
            Long userId,
            @Size(max = 30, message = "이동수단은 30자까지 넣을 수 있습니다.")
            @NotBlank(message = "이동수단을 입력하세요.") String vehicleNo,
            @Size(max = 100, message = "이동수단명은 100자까지 넣을 수 있습니다.")
            String vehicleName,
            @Size(max = 100, message = "사용목적명은 100자까지 넣을 수 있습니다.")
            String usePurpose,
            @Size(max = 200, message = "출발지 주소는 200자까지 넣을 수 있습니다.")
            String departure,
            @Size(max = 200, message = "도착지 주소는 200자까지 넣을 수 있습니다.")
            String destination,
            @PositiveOrZero(message = "운행거리는 0 이상이어야 합니다.")
            BigDecimal distance,
            @Size(max = 300, message = "적요는 300자까지 넣을 수 있습니다.")
            String purpose
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
            String approverName, String rejectReason,
            /* 원본 외근조회 격자의 운행 기록 칸 */
            String departure, String vehicleNo, String vehicleName, String usePurpose, BigDecimal distance
    ) {
        public static FieldWorkResponse from(FieldWork f) {
            return new FieldWorkResponse(
                    f.getId(),
                    f.getUser().getId(), f.getUser().getName(), f.getUser().getDepartment(),
                    f.getWorkDate(), f.getStartTime(), f.getEndTime(),
                    f.getDestination(), f.getPurpose(),
                    f.getStatus(), f.getStatus().getDisplayName(),
                    f.getApprover() != null ? f.getApprover().getName() : null,
                    f.getRejectReason(),
                    f.getDeparture(), f.getVehicleNo(), f.getVehicleName(), f.getUsePurpose(), f.getDistance());
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
