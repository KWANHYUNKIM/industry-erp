package com.erp.dto;

import com.erp.domain.BankAccount;
import com.erp.domain.BankTransaction;
import com.erp.domain.CardUsage;
import com.erp.domain.CreditCard;
import com.erp.domain.enums.CardType;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;

public final class BankCardDtos {

    private BankCardDtos() {}

    // ── 계좌 ──────────────────────────────────────────────────────────

    public record BankAccountRequest(
            @NotBlank(message = "은행명을 입력하세요.") String bankName,
            @NotBlank(message = "계좌번호를 입력하세요.") String accountNo,
            String holder,
            /** 분개에 쓸 예금계정. 없으면 보통예금(103) */
            Long glAccountId,
            @PositiveOrZero(message = "기초잔액은 0보다 작을 수 없습니다.") BigDecimal openingBalance,
            Boolean active,
            String remark
    ) {}

    public record BankAccountResponse(
            Long id, String bankName, String accountNo, String holder,
            Long glAccountId, String glAccountCode, String glAccountName,
            BigDecimal balance, boolean active, String remark
    ) {
        public static BankAccountResponse from(BankAccount b) {
            return new BankAccountResponse(
                    b.getId(), b.getBankName(), b.getAccountNo(), b.getHolder(),
                    b.getGlAccount().getId(), b.getGlAccount().getCode(), b.getGlAccount().getName(),
                    b.getBalance(), b.isActive(), b.getRemark());
        }
    }

    // ── 카드 ──────────────────────────────────────────────────────────

    public record CreditCardRequest(
            @NotBlank(message = "카드명을 입력하세요.") String cardName,
            @NotBlank(message = "카드사를 입력하세요.") String cardCompany,
            @NotBlank(message = "카드번호를 입력하세요.") String cardNo,
            @NotNull(message = "카드 종류를 선택하세요.") CardType type,
            String ownerName,
            Long settlementAccountId,
            Integer settlementDay,
            Boolean active,
            String remark
    ) {}

    public record CreditCardResponse(
            Long id, String cardName, String cardCompany, String cardNo,
            CardType type, String typeName, String ownerName,
            Long settlementAccountId, String settlementAccountName,
            Integer settlementDay, boolean active, String remark
    ) {
        public static CreditCardResponse from(CreditCard c) {
            BankAccount s = c.getSettlementAccount();
            return new CreditCardResponse(
                    c.getId(), c.getCardName(), c.getCardCompany(), c.getCardNo(),
                    c.getType(), c.getType().getDisplayName(), c.getOwnerName(),
                    s != null ? s.getId() : null,
                    s != null ? s.getBankName() + " " + s.getAccountNo() : null,
                    c.getSettlementDay(), c.isActive(), c.getRemark());
        }
    }

    // ── 계좌 입출금 ────────────────────────────────────────────────────

    public record BankTxnRequest(
            @NotNull(message = "계좌를 선택하세요.") Long bankAccountId,
            @NotNull(message = "입금/출금을 선택하세요.") Boolean deposit,
            @NotNull @Positive(message = "금액은 0보다 커야 합니다.") BigDecimal amount,
            @NotNull(message = "상대계정을 선택하세요.") Long counterAccountId,
            Long partnerId,
            LocalDate txnDate,
            String description
    ) {}

    public record BankTxnResponse(
            Long id, String txnNo, LocalDate txnDate,
            Long bankAccountId, String bankName, String accountNo,
            boolean deposit, String directionName, BigDecimal amount,
            Long counterAccountId, String counterAccountName,
            Long partnerId, String partnerName,
            BigDecimal balanceAfter, Long journalEntryId, String journalDocNo,
            String description, String createdBy
    ) {
        public static BankTxnResponse from(BankTransaction t) {
            return new BankTxnResponse(
                    t.getId(), t.getTxnNo(), t.getTxnDate(),
                    t.getBankAccount().getId(), t.getBankAccount().getBankName(), t.getBankAccount().getAccountNo(),
                    t.isDeposit(), t.isDeposit() ? "입금" : "출금", t.getAmount(),
                    t.getCounterAccount().getId(), t.getCounterAccount().getName(),
                    t.getPartner() != null ? t.getPartner().getId() : null,
                    t.getPartner() != null ? t.getPartner().getName() : null,
                    t.getBalanceAfter(),
                    t.getJournalEntry() != null ? t.getJournalEntry().getId() : null,
                    t.getJournalEntry() != null ? t.getJournalEntry().getDocNo() : null,
                    t.getDescription(), t.getCreatedBy());
        }
    }

    // ── 카드사용 ──────────────────────────────────────────────────────

    public record CardUsageRequest(
            @NotNull(message = "카드를 선택하세요.") Long cardId,
            @NotBlank(message = "가맹점을 입력하세요.") String merchant,
            @NotNull(message = "비용계정을 선택하세요.") Long expenseAccountId,
            @NotNull @Positive(message = "공급가액은 0보다 커야 합니다.") BigDecimal supplyAmount,
            /** 미입력 시 공급가액의 10% */
            @PositiveOrZero(message = "부가세는 0보다 작을 수 없습니다.") BigDecimal vatAmount,
            LocalDate usageDate,
            String description
    ) {}

    public record CardUsageResponse(
            Long id, String usageNo, LocalDate usageDate,
            Long cardId, String cardName, String cardCompany, String cardNo, String cardTypeName,
            String merchant,
            Long expenseAccountId, String expenseAccountName,
            BigDecimal supplyAmount, BigDecimal vatAmount, BigDecimal totalAmount,
            Long journalEntryId, String journalDocNo,
            String description, String createdBy
    ) {
        public static CardUsageResponse from(CardUsage u) {
            CreditCard c = u.getCard();
            return new CardUsageResponse(
                    u.getId(), u.getUsageNo(), u.getUsageDate(),
                    c.getId(), c.getCardName(), c.getCardCompany(), c.getCardNo(), c.getType().getDisplayName(),
                    u.getMerchant(),
                    u.getExpenseAccount().getId(), u.getExpenseAccount().getName(),
                    u.getSupplyAmount(), u.getVatAmount(), u.getTotalAmount(),
                    u.getJournalEntry() != null ? u.getJournalEntry().getId() : null,
                    u.getJournalEntry() != null ? u.getJournalEntry().getDocNo() : null,
                    u.getDescription(), u.getCreatedBy());
        }
    }
}
