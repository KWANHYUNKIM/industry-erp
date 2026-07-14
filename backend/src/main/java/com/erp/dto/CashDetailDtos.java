package com.erp.dto;

import com.erp.domain.AccountTransfer;
import com.erp.domain.CardPayment;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** 현금거래 세분류 — 계좌간이동 · 법인카드 대금결제 */
public final class CashDetailDtos {

    private CashDetailDtos() {}

    // ── 계좌간이동 ────────────────────────────────────────────────────

    public record AccountTransferRequest(
            @NotNull(message = "출금 계좌를 선택하세요.") Long fromAccountId,
            @NotNull(message = "입금 계좌를 선택하세요.") Long toAccountId,
            @NotNull @Positive(message = "이동 금액은 0보다 커야 합니다.") BigDecimal amount,
            LocalDate transferDate,
            String description
    ) {}

    public record AccountTransferResponse(
            Long id, String transferNo, LocalDate transferDate,
            Long fromAccountId, String fromAccountName, BigDecimal fromBalanceAfter,
            Long toAccountId, String toAccountName, BigDecimal toBalanceAfter,
            BigDecimal amount,
            Long journalEntryId, String journalDocNo,
            String description, String createdBy
    ) {
        public static AccountTransferResponse from(AccountTransfer t) {
            return new AccountTransferResponse(
                    t.getId(), t.getTransferNo(), t.getTransferDate(),
                    t.getFromAccount().getId(),
                    t.getFromAccount().getBankName() + " " + t.getFromAccount().getAccountNo(),
                    t.getFromAccount().getBalance(),
                    t.getToAccount().getId(),
                    t.getToAccount().getBankName() + " " + t.getToAccount().getAccountNo(),
                    t.getToAccount().getBalance(),
                    t.getAmount(),
                    t.getJournalEntry() != null ? t.getJournalEntry().getId() : null,
                    t.getJournalEntry() != null ? t.getJournalEntry().getDocNo() : null,
                    t.getDescription(), t.getCreatedBy());
        }
    }

    // ── 카드대금 결제 ─────────────────────────────────────────────────

    public record CardPaymentRequest(
            @NotNull(message = "카드를 선택하세요.") Long cardId,
            /** 비우면 카드에 등록된 결제계좌 */
            Long bankAccountId,
            LocalDate paymentDate,
            /** 비우면 그 카드의 미결제 사용건 전체 */
            List<Long> cardUsageIds
    ) {}

    public record CardPaymentLineResponse(
            Long cardUsageId, String usageNo, LocalDate usageDate,
            String merchant, String expenseAccountName, BigDecimal amount) {}

    public record CardPaymentResponse(
            Long id, String paymentNo, LocalDate paymentDate,
            Long cardId, String cardName, String cardCompany,
            Long bankAccountId, String bankAccountName,
            BigDecimal amount,
            Long journalEntryId, String journalDocNo,
            String createdBy, List<CardPaymentLineResponse> lines
    ) {
        public static CardPaymentResponse from(CardPayment p) {
            return new CardPaymentResponse(
                    p.getId(), p.getPaymentNo(), p.getPaymentDate(),
                    p.getCard().getId(), p.getCard().getCardName(), p.getCard().getCardCompany(),
                    p.getBankAccount().getId(),
                    p.getBankAccount().getBankName() + " " + p.getBankAccount().getAccountNo(),
                    p.getAmount(),
                    p.getJournalEntry() != null ? p.getJournalEntry().getId() : null,
                    p.getJournalEntry() != null ? p.getJournalEntry().getDocNo() : null,
                    p.getCreatedBy(),
                    p.getLines().stream()
                            .map(l -> new CardPaymentLineResponse(
                                    l.getCardUsage().getId(), l.getCardUsage().getUsageNo(),
                                    l.getCardUsage().getUsageDate(), l.getCardUsage().getMerchant(),
                                    l.getCardUsage().getExpenseAccount().getName(), l.getAmount()))
                            .toList());
        }
    }
}
