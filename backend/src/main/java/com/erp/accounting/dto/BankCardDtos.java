package com.erp.accounting.dto;

import com.erp.accounting.domain.BankAccount;
import com.erp.accounting.domain.BankTransaction;
import com.erp.accounting.domain.CardUsage;
import com.erp.accounting.domain.CreditCard;
import com.erp.accounting.domain.enums.CardType;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class BankCardDtos {

    private BankCardDtos() {}

    // ── 계좌 ──────────────────────────────────────────────────────────

    public record BankAccountRequest(
            /* 원본 [계좌코드]·[계좌명]. 이미 있는 계좌에는 없으므로 필수가 아니다. */
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.")
            String code,
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String name,
            @Size(max = 50, message = "은행명은 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "은행명을 입력하세요.") String bankName,
            @Size(max = 50, message = "계좌번호는 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "계좌번호를 입력하세요.") String accountNo,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String holder,
            /** 분개에 쓸 예금계정. 없으면 보통예금(103) */
            Long glAccountId,
            /** 원본 [외화통장환종]. 안 주면 원화 통장이다. */
            Long currencyId,
            @PositiveOrZero(message = "기초잔액은 0보다 작을 수 없습니다.") BigDecimal openingBalance,
            Boolean active,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String remark
    ) {}

    public record BankAccountResponse(
            Long id, String code, String name,
            String bankName, String accountNo, String holder,
            Long glAccountId, String glAccountCode, String glAccountName,
            /** 원본 [외화통장환종]. 안 정한 통장은 null — 원화다. */
            Long currencyId, String currencyCode, String currencyName,
            BigDecimal balance, boolean active, String remark
    ) {
        public static BankAccountResponse from(BankAccount b) {
            return new BankAccountResponse(
                    b.getId(), b.getCode(), b.getName(),
                    b.getBankName(), b.getAccountNo(), b.getHolder(),
                    b.getGlAccount().getId(), b.getGlAccount().getCode(), b.getGlAccount().getName(),
                    b.getCurrency() != null ? b.getCurrency().getId() : null,
                    b.getCurrency() != null ? b.getCurrency().getCode() : null,
                    b.getCurrency() != null ? b.getCurrency().getName() : null,
                    b.getBalance(), b.isActive(), b.getRemark());
        }
    }

    // ── 카드 ──────────────────────────────────────────────────────────

    public record CreditCardRequest(
            /* 원본 [카드코드]. 이미 있는 카드에는 없으므로 필수가 아니다. */
            @Size(max = 20, message = "입력한 글자가 너무 깁니다. 20자까지 넣을 수 있습니다.")
            String code,
            @Size(max = 50, message = "카드명은 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "카드명을 입력하세요.") String cardName,
            @Size(max = 50, message = "카드사는 50자까지 넣을 수 있습니다.")
            @NotBlank(message = "카드사를 입력하세요.") String cardCompany,
            @Size(max = 30, message = "카드번호는 30자까지 넣을 수 있습니다.")
            @NotBlank(message = "카드번호를 입력하세요.") String cardNo,
            @NotNull(message = "카드 종류를 선택하세요.") CardType type,
            @Size(max = 50, message = "입력한 글자가 너무 깁니다. 50자까지 넣을 수 있습니다.")
            String ownerName,
            Long settlementAccountId,
            Integer settlementDay,
            Boolean active,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String remark
    ) {}

    public record CreditCardResponse(
            Long id, String code, String cardName, String cardCompany, String cardNo,
            CardType type, String typeName, String ownerName,
            Long settlementAccountId, String settlementAccountName,
            /*
             * 원본 카드등록의 [계정명] — 결제계좌가 물고 있는 <b>예금계정</b>이다.
             * 카드 사용이 어느 계정으로 분개되는지를 카드 목록에서 바로 보라는 뜻이다.
             */
            String glAccountName,
            Integer settlementDay, boolean active, String remark
    ) {
        public static CreditCardResponse from(CreditCard c) {
            BankAccount s = c.getSettlementAccount();
            return new CreditCardResponse(
                    c.getId(), c.getCode(), c.getCardName(), c.getCardCompany(), c.getCardNo(),
                    c.getType(), c.getType().getDisplayName(), c.getOwnerName(),
                    s != null ? s.getId() : null,
                    s != null ? s.getBankName() + " " + s.getAccountNo() : null,
                    s != null && s.getGlAccount() != null ? s.getGlAccount().getName() : null,
                    c.getSettlementDay(), c.isActive(), c.getRemark());
        }
    }

    // ── 계좌 입출금 ────────────────────────────────────────────────────

    public record BankTxnRequest(
            @NotNull(message = "계좌를 선택하세요.") Long bankAccountId,
            @NotNull(message = "입금/출금을 선택하세요.") Boolean deposit,
            @NotNull(message = "금액을 입력하세요.") @Positive(message = "금액은 0보다 커야 합니다.") BigDecimal amount,
            @NotNull(message = "상대계정을 선택하세요.") Long counterAccountId,
            Long partnerId,
            LocalDate txnDate,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String description
    ) {}

    /**
     * 계좌 입출금 목록 — <b>줄이 너무 많으면 앞부분만</b> 준다.
     *
     * <p>이 자리는 조건이 하나도 없어서 늘 전부 줬다. 재 보니 <b>1만 2천 줄·5MB</b> 였고,
     * 자금관리 화면은 <b>다른 탭을 보고 있어도</b> 열 때 이것까지 함께 받았다.
     * 원본은 조회 화면 139곳에 [오천건이상조회] 를 두고 그 위는 눌러야 가게 한다(사본 실측).
     * 재고수불부·회계전표조회와 같은 방식이다.
     */
    public record BankTxnListResponse(
            List<BankTxnResponse> rows,
            long totalRows,
            boolean truncated
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
                    t.getCounterAccount() != null ? t.getCounterAccount().getId() : null,
                    t.getCounterAccount() != null ? t.getCounterAccount().getName() : null,
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
            @Size(max = 100, message = "가맹점은 100자까지 넣을 수 있습니다.")
            @NotBlank(message = "가맹점을 입력하세요.") String merchant,
            @NotNull(message = "비용계정을 선택하세요.") Long expenseAccountId,
            @NotNull(message = "공급가액을 입력하세요.") @Positive(message = "공급가액은 0보다 커야 합니다.") BigDecimal supplyAmount,
            /** 미입력 시 공급가액의 10% */
            @PositiveOrZero(message = "부가세는 0보다 작을 수 없습니다.") BigDecimal vatAmount,
            LocalDate usageDate,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
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
