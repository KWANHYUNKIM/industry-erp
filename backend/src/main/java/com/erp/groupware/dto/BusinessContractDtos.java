package com.erp.groupware.dto;

import com.erp.groupware.domain.BusinessContract;
import com.erp.groupware.domain.enums.BusinessContractStatus;
import com.erp.groupware.domain.enums.BusinessContractType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;

public final class BusinessContractDtos {

    private BusinessContractDtos() {}

    public record CreateContractRequest(
            @NotBlank(message = "계약명을 입력하세요.") String title,
            @NotNull(message = "계약 종류를 선택하세요.") BusinessContractType type,
            @NotNull(message = "거래처를 선택하세요.") Long partnerId,
            @NotNull(message = "계약 시작일을 입력하세요.") LocalDate startDate,
            @NotNull(message = "계약 종료일을 입력하세요.") LocalDate endDate,
            @NotNull @PositiveOrZero(message = "계약금액은 0보다 작을 수 없습니다.") BigDecimal amount,
            String paymentTerms,
            String content
    ) {}

    /** 전자서명: 서명자 이름과 동의문구를 남긴다 */
    public record SignRequest(
            @NotBlank(message = "서명자 이름을 입력하세요.") String signerName,
            @NotBlank(message = "동의문구를 입력하세요.") String agreement
    ) {}

    public record TerminateRequest(
            LocalDate terminatedDate,
            @NotBlank(message = "해지 사유를 입력하세요.") String reason
    ) {}

    public record ContractResponse(
            Long id, String contractNo, String title,
            BusinessContractType type, String typeName,
            BusinessContractStatus status, String statusName,
            Long partnerId, String partnerName,
            LocalDate startDate, LocalDate endDate, BigDecimal amount,
            String paymentTerms, String content,
            LocalDateTime sentAt,
            String signerName, LocalDateTime signedAt, String agreement,
            LocalDate terminatedDate, String terminationReason,
            /** 오늘 기준 만료까지 남은 일수 (해지·만료된 계약은 음수/0) */
            long daysToExpiry,
            String createdBy
    ) {
        public static ContractResponse from(BusinessContract c, LocalDate today) {
            return new ContractResponse(
                    c.getId(), c.getContractNo(), c.getTitle(),
                    c.getType(), c.getType().getDisplayName(),
                    c.getStatus(), c.getStatus().getDisplayName(),
                    c.getPartner().getId(), c.getPartner().getName(),
                    c.getStartDate(), c.getEndDate(), c.getAmount(),
                    c.getPaymentTerms(), c.getContent(),
                    c.getSentAt(),
                    c.getSignerName(), c.getSignedAt(), c.getAgreement(),
                    c.getTerminatedDate(), c.getTerminationReason(),
                    ChronoUnit.DAYS.between(today, c.getEndDate()),
                    c.getCreatedBy());
        }
    }
}
