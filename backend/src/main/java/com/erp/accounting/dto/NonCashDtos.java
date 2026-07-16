package com.erp.accounting.dto;

import com.erp.accounting.domain.NonCashTransaction;
import com.erp.accounting.domain.enums.NonCashType;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class NonCashDtos {

    private NonCashDtos() {}

    /**
     * 유형이 차/대변을 정한다.
     *   상계    : 계정 입력 없음 (외상매입금 ↔ 외상매출금)
     *   대손    : 계정 입력 없음 (대손상각비 ↔ 외상매출금)
     *   미지급  : 차변(비용계정)만 입력
     *   계정대체: 차·대변 모두 입력
     */
    public record CreateNonCashRequest(
            @NotNull(message = "유형을 선택하세요.") NonCashType type,
            @NotNull @Positive(message = "금액은 0보다 커야 합니다.") BigDecimal amount,
            Long debitAccountId,
            Long creditAccountId,
            Long partnerId,
            LocalDate txnDate,
            String description
    ) {}

    public record NonCashResponse(
            Long id, String txnNo, NonCashType type, String typeName, LocalDate txnDate,
            Long debitAccountId, String debitAccountCode, String debitAccountName,
            Long creditAccountId, String creditAccountCode, String creditAccountName,
            BigDecimal amount,
            Long partnerId, String partnerName,
            Long journalEntryId, String journalDocNo,
            String description, String createdBy
    ) {
        public static NonCashResponse from(NonCashTransaction t) {
            return new NonCashResponse(
                    t.getId(), t.getTxnNo(), t.getType(), t.getType().getDisplayName(), t.getTxnDate(),
                    t.getDebitAccount().getId(), t.getDebitAccount().getCode(), t.getDebitAccount().getName(),
                    t.getCreditAccount().getId(), t.getCreditAccount().getCode(), t.getCreditAccount().getName(),
                    t.getAmount(),
                    t.getPartner() != null ? t.getPartner().getId() : null,
                    t.getPartner() != null ? t.getPartner().getName() : null,
                    t.getJournalEntry() != null ? t.getJournalEntry().getId() : null,
                    t.getJournalEntry() != null ? t.getJournalEntry().getDocNo() : null,
                    t.getDescription(), t.getCreatedBy());
        }
    }
}
