package com.erp.dto;

import com.erp.domain.BankCheck;
import com.erp.domain.enums.CheckStatus;
import com.erp.domain.enums.CheckType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class BankCheckDtos {

    private BankCheckDtos() {}

    public record CreateCheckRequest(
            @NotNull(message = "수표 종류를 선택하세요.") CheckType type,
            @NotBlank(message = "수표번호를 입력하세요.") String checkNo,
            @NotNull @Positive(message = "금액은 0보다 커야 합니다.") BigDecimal amount,
            LocalDate issueDate,
            String bankName,
            Long partnerId,
            /** 발행수표는 끊어 줄 당좌계좌가 필수 */
            Long bankAccountId,
            String remark
    ) {}

    /** 받은수표 입금: 어느 계좌에 넣을지 */
    public record DepositRequest(
            @NotNull(message = "입금할 계좌를 선택하세요.") Long bankAccountId,
            LocalDate depositDate
    ) {}

    public record SettleRequest(LocalDate settledDate) {}

    public record CheckResponse(
            Long id, String checkNo, CheckType type, String typeName,
            CheckStatus status, String statusName,
            LocalDate issueDate, BigDecimal amount, String bankName,
            Long partnerId, String partnerName,
            Long bankAccountId, String bankAccountName,
            LocalDate settledDate, String remark, String createdBy
    ) {
        public static CheckResponse from(BankCheck c) {
            return new CheckResponse(
                    c.getId(), c.getCheckNo(), c.getType(), c.getType().getDisplayName(),
                    c.getStatus(), c.getStatus().getDisplayName(),
                    c.getIssueDate(), c.getAmount(), c.getBankName(),
                    c.getPartner() != null ? c.getPartner().getId() : null,
                    c.getPartner() != null ? c.getPartner().getName() : null,
                    c.getBankAccount() != null ? c.getBankAccount().getId() : null,
                    c.getBankAccount() != null
                            ? c.getBankAccount().getBankName() + " " + c.getBankAccount().getAccountNo() : null,
                    c.getSettledDate(), c.getRemark(), c.getCreatedBy());
        }
    }
}
