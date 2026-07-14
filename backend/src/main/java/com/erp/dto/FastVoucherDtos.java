package com.erp.dto;

import com.erp.domain.FastVoucher;
import com.erp.domain.enums.FastVoucherType;
import com.erp.domain.enums.PaymentMethod;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class FastVoucherDtos {

    private FastVoucherDtos() {}

    public record LineInput(
            @NotNull(message = "계정을 선택하세요.") Long accountId,
            @NotNull @Positive(message = "금액은 0보다 커야 합니다.") BigDecimal amount,
            String description
    ) {}

    public record CreateVoucherRequest(
            @NotNull(message = "전표 종류를 선택하세요.") FastVoucherType type,
            LocalDate voucherDate,
            @NotNull(message = "결제(입금)수단을 선택하세요.") PaymentMethod method,
            /** method = BANK 일 때 필수 */
            Long bankAccountId,
            Long partnerId,
            /** 가지급금정산서에서만: 먼저 지급했던 가지급금 총액 */
            @PositiveOrZero(message = "가지급금은 0보다 작을 수 없습니다.") BigDecimal advanceAmount,
            @NotEmpty(message = "내역을 1줄 이상 입력하세요.") @Valid List<LineInput> lines,
            String description
    ) {}

    public record VoucherLineResponse(
            Long id, int lineNo, Long accountId, String accountCode, String accountName,
            BigDecimal amount, String description
    ) {}

    public record VoucherResponse(
            Long id, String voucherNo, FastVoucherType type, String typeName,
            LocalDate voucherDate, PaymentMethod method, String methodName,
            Long bankAccountId, String bankAccountName,
            Long partnerId, String partnerName,
            BigDecimal advanceAmount, BigDecimal totalAmount,
            /** 가지급금정산서: 가지급금 - 실사용액 (양수면 반납, 음수면 추가지급) */
            BigDecimal balance,
            Long journalEntryId, String journalDocNo,
            String description, String createdBy,
            List<VoucherLineResponse> lines
    ) {
        public static VoucherResponse from(FastVoucher v) {
            BigDecimal balance = v.getAdvanceAmount() != null
                    ? v.getAdvanceAmount().subtract(v.getTotalAmount())
                    : null;
            return new VoucherResponse(
                    v.getId(), v.getVoucherNo(), v.getType(), v.getType().getDisplayName(),
                    v.getVoucherDate(), v.getMethod(), v.getMethod().getDisplayName(),
                    v.getBankAccount() != null ? v.getBankAccount().getId() : null,
                    v.getBankAccount() != null
                            ? v.getBankAccount().getBankName() + " " + v.getBankAccount().getAccountNo() : null,
                    v.getPartner() != null ? v.getPartner().getId() : null,
                    v.getPartner() != null ? v.getPartner().getName() : null,
                    v.getAdvanceAmount(), v.getTotalAmount(), balance,
                    v.getJournalEntry() != null ? v.getJournalEntry().getId() : null,
                    v.getJournalEntry() != null ? v.getJournalEntry().getDocNo() : null,
                    v.getDescription(), v.getCreatedBy(),
                    v.getLines().stream()
                            .map(l -> new VoucherLineResponse(
                                    l.getId(), l.getLineNo(),
                                    l.getAccount().getId(), l.getAccount().getCode(), l.getAccount().getName(),
                                    l.getAmount(), l.getDescription()))
                            .toList());
        }
    }
}
