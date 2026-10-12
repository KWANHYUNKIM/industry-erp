package com.erp.accounting.fastvoucher.dto;

import com.erp.accounting.fastvoucher.FastVoucher;
import com.erp.accounting.fastvoucher.FastVoucherType;
import com.erp.accounting.PaymentMethod;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Size;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

public final class FastVoucherDtos {

    private FastVoucherDtos() {}

    /**
     * 격자 한 줄. 원본 지출결의서 · 입금보고서는 줄마다 [돈 나간(들어온) 계좌] · [거래처]를 든다.
     * {@code cash} 가 참이면 000 현금, {@code bankAccountId} 가 있으면 그 계좌 — 둘 다 없으면 머리 결제수단을 따른다(옛 호출).
     */
    public record LineInput(
            /** 현금거래 중 계정이 정해진 종류(매출처로부터 …)는 비워 보낸다 — 서비스가 채운다. 나머지는 서비스가 막는다. */
            Long accountId,
            @NotNull(message = "금액을 입력 바랍니다.") @Positive(message = "금액은 0보다 커야 합니다.") BigDecimal amount,
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String description,
            Long bankAccountId,
            Boolean cash,
            Long partnerId
    ) {
        public LineInput(Long accountId, BigDecimal amount, String description) {
            this(accountId, amount, description, null, null, null);
        }
    }

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
            @Size(max = 200, message = "입력한 글자가 너무 깁니다. 200자까지 넣을 수 있습니다.")
            String description,
            /** 영수증으로 [거래처명] — 글자 그대로. */
            @Size(max = 100, message = "입력한 글자가 너무 깁니다. 100자까지 넣을 수 있습니다.")
            String payeeName,
            /** 영수증으로 [수수료]. */
            @PositiveOrZero(message = "수수료는 0보다 작을 수 없습니다.") BigDecimal fee,
            /** 현금거래: 계좌간이동 [출금계좌] · 은행차입으로 · 은행으로 [차입처]. */
            Long counterBankAccountId,
            /** 법인카드대금결제 [카드]. */
            Long creditCardId,
            /** 카드매출대금회수 [카드사]. */
            Long cardIssuerId,
            /** 일시적으로 [사원]. 이름은 payeeName 으로 함께 보낸다. */
            Long employeeId,
            /** 카드매출대금회수 [수수료율](%). */
            @PositiveOrZero(message = "수수료율은 0보다 작을 수 없습니다.") BigDecimal feeRate
    ) {}

    public record VoucherLineResponse(
            Long id, int lineNo, Long accountId, String accountCode, String accountName,
            BigDecimal amount, String description,
            /** 줄의 결제 계좌 — cash 면 000 현금, 아니면 bankAccountId(없으면 머리 결제수단). */
            Long bankAccountId, Boolean cash, Long partnerId,
            String bankAccountCode, String bankAccountName, String partnerCode, String partnerName
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
            List<VoucherLineResponse> lines,
            String payeeName, BigDecimal fee,
            Long counterBankAccountId, String counterBankAccountCode, String counterBankAccountName,
            Long creditCardId, String creditCardCode, String creditCardName,
            Long cardIssuerId, String cardIssuerCode, String cardIssuerName,
            Long employeeId, BigDecimal feeRate,
            /** 머리 계좌(현금거래의 입금 · 출금계좌) — 000 현금이면 code '000'. */
            String bankAccountCode
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
                                    l.getAmount(), l.getDescription(),
                                    l.getBankAccount() != null ? l.getBankAccount().getId() : null,
                                    l.isOwnSettlement() && l.getBankAccount() == null,
                                    l.getPartner() != null ? l.getPartner().getId() : null,
                                    l.getBankAccount() != null ? bankCode(l.getBankAccount()) : (l.isOwnSettlement() ? "000" : null),
                                    l.getBankAccount() != null ? bankName(l.getBankAccount()) : (l.isOwnSettlement() ? "현금" : null),
                                    l.getPartner() != null ? l.getPartner().getCode() : null,
                                    l.getPartner() != null ? l.getPartner().getName() : null))
                            .toList(),
                    v.getPayeeName(), v.getFee(),
                    v.getCounterBankAccount() != null ? v.getCounterBankAccount().getId() : null,
                    v.getCounterBankAccount() != null ? bankCode(v.getCounterBankAccount()) : null,
                    v.getCounterBankAccount() != null ? bankName(v.getCounterBankAccount()) : null,
                    v.getCreditCard() != null ? v.getCreditCard().getId() : null,
                    v.getCreditCard() != null ? v.getCreditCard().getCode() : null,
                    v.getCreditCard() != null ? v.getCreditCard().getCardName() : null,
                    v.getCardIssuer() != null ? v.getCardIssuer().getId() : null,
                    v.getCardIssuer() != null ? v.getCardIssuer().getCode() : null,
                    v.getCardIssuer() != null ? v.getCardIssuer().getName() : null,
                    v.getEmployeeId(), v.getFeeRate(),
                    v.getBankAccount() != null ? bankCode(v.getBankAccount()) : (v.getMethod() == PaymentMethod.CASH ? "000" : null));
        }
    }

    /** 원본 계좌검색의 [계좌코드] — 등록한 코드가 없으면 계좌번호. */
    public static String bankCode(com.erp.accounting.bankcard.BankAccount b) {
        return b.getCode() != null && !b.getCode().isBlank() ? b.getCode() : b.getAccountNo();
    }

    /** 원본 계좌검색의 [계좌명] — 등록한 이름이 없으면 '은행-계좌번호 끝 4자리'(기업은행-1122). */
    public static String bankName(com.erp.accounting.bankcard.BankAccount b) {
        if (b.getName() != null && !b.getName().isBlank()) return b.getName();
        String no = b.getAccountNo() == null ? "" : b.getAccountNo().replaceAll("\\D", "");
        return b.getBankName() + (no.length() >= 4 ? "-" + no.substring(no.length() - 4) : "");
    }

    /**
     * 원본 [오천건이상조회] 와 같은 자리. 전표가 5천 건을 넘으면 앞 5천 건만 주고
     * <b>잘랐다고 밝힌다</b> — 화면은 그때만 [오천건이상조회] 를 눌리게 한다(QA 52회차).
     */
    public record VoucherList(java.util.List<VoucherResponse> rows, long totalRows, boolean truncated) {}
}
