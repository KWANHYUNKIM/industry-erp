package com.erp.accounting.fastvoucher;

import com.erp.accounting.bankcard.BankCardService;
import com.erp.accounting.journal.JournalService;
import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.accounting.account.Account;
import com.erp.accounting.bankcard.BankAccount;
import com.erp.accounting.journal.JournalEntry;
import com.erp.accounting.PaymentMethod;
import com.erp.accounting.fastvoucher.dto.FastVoucherDtos.CreateVoucherRequest;
import com.erp.accounting.fastvoucher.dto.FastVoucherDtos.LineInput;
import com.erp.accounting.fastvoucher.dto.FastVoucherDtos.VoucherResponse;
import com.erp.accounting.account.AccountRepository;
import com.erp.accounting.bankcard.BankAccountRepository;
import com.erp.trade.partner.BusinessPartnerRepository;
import com.erp.trade.partner.BusinessPartner;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import com.erp.accounting.fastvoucher.dto.FastVoucherDtos;

/**
 * 회계 I > FastEntry — 지출결의서 · 입금보고서 · 가지급금정산서.
 * 라인과 결제수단만 받아 복식부기 분개(JournalService)를 만들고,
 * 계좌로 결제·입금하면 계좌 잔액과 입출금 내역까지 함께 움직인다(BankCardService).
 */
@Service
@RequiredArgsConstructor
public class FastVoucherService {

    private static final String CASH = "101";              // 현금
    private static final String PAYABLE = "253";           // 미지급금
    private static final String RECEIVABLE = "108";        // 외상매출금
    private static final String ADVANCE = "134";           // 가지급금
    private static final String FEE = "831";               // 지급수수료
    private static final String OTHER_RECEIVABLE = "120";  // 미수금 (카드사)
    private static final String INTEREST = "951";          // 이자비용

    private final FastVoucherRepository voucherRepository;
    private final AccountRepository accountRepository;
    private final BankAccountRepository bankAccountRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final com.erp.accounting.bankcard.CreditCardRepository creditCardRepository;
    private final com.erp.accounting.cardissuer.CardIssuerRepository cardIssuerRepository;
    private final JournalService journalService;
    private final BankCardService bankCardService;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<VoucherResponse> findAll(FastVoucherType type) {
        return findAll(type, null, null);
    }

    /**
     * 화면 조건 판의 <b>[기간]</b>. 예전에는 물어보지도 않고 전 기간을 통째로 주었다.
     *
     * <p>안 주면 <b>넓은 경계</b>로 채운다 — <code>:from is null or …</code> 로 쓰면
     * PostgreSQL 이 파라미터 타입을 못 정해 42P18 로 터진다.
     */
    @Transactional(readOnly = true)
    public List<VoucherResponse> findAll(FastVoucherType type,
                                         java.time.LocalDate from, java.time.LocalDate to) {
        return voucherRepository.findAllWithRefs(type,
                from != null ? from : java.time.LocalDate.of(1900, 1, 1),
                to != null ? to : java.time.LocalDate.of(9999, 12, 31)).stream().map(VoucherResponse::from).toList();
    }

    /** 한 번에 내려보낼 전표 수의 문턱. 원본 [오천건이상조회] 와 같은 자리다. */
    public static final int LIST_PAGE_ROWS = 5000;

    /** 목록 화면용 — 5천 건을 넘으면 앞 5천 건만 주고 잘랐다고 밝힌다. {@code all} 이면 다 준다. */
    @Transactional(readOnly = true)
    public FastVoucherDtos.VoucherList list(FastVoucherType type, java.time.LocalDate from, java.time.LocalDate to,
                                            boolean all) {
        List<VoucherResponse> rows = findAll(type, from, to);
        boolean truncated = !all && rows.size() > LIST_PAGE_ROWS;
        return new FastVoucherDtos.VoucherList(truncated ? rows.subList(0, LIST_PAGE_ROWS) : rows, rows.size(), truncated);
    }

    @Transactional
    public VoucherResponse create(CreateVoucherRequest req, String username) {
        LocalDate date = req.voucherDate() != null ? req.voucherDate() : LocalDate.now();
        FastVoucher v = FastVoucher.builder()
                .voucherNo(docNoGenerator.next("FV-", "fast_vouchers", "voucher_no", "voucher_date", date))
                .type(req.type())
                .voucherDate(date)
                .createdBy(username)
                .totalAmount(BigDecimal.ZERO)
                .method(req.method())
                .build();
        apply(v, req, username);
        voucherRepository.save(v);
        return VoucherResponse.from(v);
    }

    @Transactional(readOnly = true)
    public VoucherResponse get(Long id) {
        return VoucherResponse.from(find(id));
    }

    /** 회계전표조회에서 전표를 누르면 그 전표를 만든 지출결의서 · 입금보고서를 연다. */
    @Transactional(readOnly = true)
    public VoucherResponse findByJournal(Long journalEntryId) {
        return voucherRepository.findByJournalEntryId(journalEntryId).map(VoucherResponse::from)
                .orElseThrow(() -> ApiException.notFound("이 회계전표를 만든 결의서가 없습니다. id=" + journalEntryId));
    }

    /**
     * 수정 — 원본은 회계거래조회에서 전표를 열어 줄을 고치고 [저장]한다(일자는 막혀 있다, 2026-10-12 loginaa 실측:
     * 26/10/12-2 금액 12,000 → 15,000 저장 → 목록 · 전표 둘 다 15,000). 옛 분개 · 계좌 입출금을 되돌리고 새로 만든다.
     */
    @Transactional
    public VoucherResponse update(Long id, CreateVoucherRequest req, String username) {
        FastVoucher v = find(id);
        if (req.type() != null && req.type() != v.getType()) {
            throw ApiException.badRequest("전표 종류는 바꿀 수 없습니다.");
        }
        undo(v, username);
        v.getLines().clear();
        voucherRepository.flush();
        if (req.method() != null) v.setMethod(req.method());
        apply(v, req, username);
        return VoucherResponse.from(v);
    }

    /** 삭제 — 분개 · 계좌 입출금을 함께 되돌린다(원본 회계거래조회 [삭제]). */
    @Transactional
    public void delete(Long id, String username) {
        FastVoucher v = find(id);
        undo(v, username);
        voucherRepository.delete(v);
    }

    private FastVoucher find(Long id) {
        return voucherRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("전표를 찾을 수 없습니다. id=" + id));
    }

    /** 이 전표가 만든 계좌 입출금을 되돌리고 분개를 지운다. */
    private void undo(FastVoucher v, String username) {
        JournalEntry old = v.getJournalEntry();
        if (old == null) return;
        bankCardService.reverseExternal(old, v.getType().getDisplayName() + " " + v.getVoucherNo() + " 취소", username);
        v.setJournalEntry(null);
        voucherRepository.flush();
        journalService.deleteEntry(old);
    }

    /** 요청의 줄 · 머리를 전표에 싣고 분개 · 계좌 입출금을 만든다(등록 · 수정 공통). */
    private void apply(FastVoucher v, CreateVoucherRequest req, String username) {
        if (v.getType().isCashQuick()) {
            applyCashQuick(v, req, username);
            return;
        }
        if (req.lines() == null || req.lines().isEmpty()) {
            throw ApiException.badRequest("내역을 1줄 이상 입력하세요.");
        }
        if (req.lines().stream().anyMatch(l -> l.accountId() == null)) {
            throw ApiException.badRequest("계정코드를 입력 바랍니다.");
        }
        PaymentMethod method = req.method() != null ? req.method() : PaymentMethod.CASH;
        v.setMethod(method);
        BigDecimal total = req.lines().stream().map(LineInput::amount).reduce(BigDecimal.ZERO, BigDecimal::add);

        BankAccount bank = null;
        boolean allOwn = req.lines().stream().allMatch(l -> Boolean.TRUE.equals(l.cash()) || l.bankAccountId() != null);
        if (method == PaymentMethod.BANK && !allOwn) {
            if (req.bankAccountId() == null) {
                throw ApiException.badRequest("계좌를 선택하세요.");
            }
            bank = bankAccount(req.bankAccountId());
        }

        BigDecimal advance = null;
        if (v.getType() == FastVoucherType.ADVANCE_SETTLEMENT) {
            if (req.advanceAmount() == null || req.advanceAmount().signum() <= 0) {
                throw ApiException.badRequest("가지급금정산서는 먼저 지급했던 가지급금 금액이 필요합니다.");
            }
            if (method == PaymentMethod.CREDIT) {
                throw ApiException.badRequest("가지급금 정산은 현금 또는 계좌로만 처리할 수 있습니다.");
            }
            advance = req.advanceAmount();
        }
        v.setBankAccount(bank);
        v.setAdvanceAmount(advance);
        v.setTotalAmount(total);
        v.setDescription(req.description());

        BusinessPartner headPartner = req.partnerId() != null ? partner(req.partnerId()) : null;
        for (LineInput in : req.lines()) {
            boolean own = Boolean.TRUE.equals(in.cash()) || in.bankAccountId() != null;
            v.addLine(FastVoucherLine.builder()
                    .account(account(in.accountId()))
                    .amount(in.amount())
                    .description(in.description())
                    .ownSettlement(own)
                    .bankAccount(in.bankAccountId() != null ? bankAccount(in.bankAccountId()) : null)
                    .partner(in.partnerId() != null ? partner(in.partnerId()) : null)
                    .build());
            if (headPartner == null && in.partnerId() != null) headPartner = v.getLines().get(v.getLines().size() - 1).getPartner();
        }
        // 영수증으로: [거래처명]은 친 글자 그대로, [수수료]는 지급수수료 줄로 — 출금계좌에서는 금액+수수료가 나간다.
        if (v.getType() == FastVoucherType.RECEIPT_PAYMENT) {
            v.setPayeeName(req.payeeName() != null && !req.payeeName().isBlank() ? req.payeeName().trim() : null);
            BigDecimal fee = req.fee() != null ? req.fee() : BigDecimal.ZERO;
            v.setFee(fee);
            if (fee.signum() > 0) {
                FastVoucherLine first = v.getLines().get(0);
                v.addLine(FastVoucherLine.builder()
                        .account(account(FEE))
                        .amount(fee)
                        .description("수수료")
                        .ownSettlement(first.isOwnSettlement())
                        .bankAccount(first.getBankAccount())
                        .build());
            }
        } else {
            v.setPayeeName(null);
            v.setFee(BigDecimal.ZERO);
        }
        // 원본 회계거래조회 [거래처명]은 줄의 거래처다(26/10/13-2 지출결의서 · 스타벅스). 머리에 없으면 첫 거래처 줄.
        v.setPartner(headPartner);

        Account headSettlement = settlementAccount(v.getType(), method, bank);
        JournalEntry entry = journalService.createFromVoucher(v, headSettlement,
                l -> l.isOwnSettlement() ? (l.getBankAccount() != null ? l.getBankAccount().getGlAccount() : account(CASH)) : headSettlement);
        v.setJournalEntry(entry);

        // 계좌로 냈거나 받았으면 잔액과 입출금 내역도 움직인다(분개는 위에서 이미 만들었으므로 재생성하지 않는다).
        String memo = v.getType().getDisplayName() + " " + v.getVoucherNo();
        if (v.getType() == FastVoucherType.ADVANCE_SETTLEMENT) {
            BigDecimal flow = v.getAdvanceAmount().subtract(v.getTotalAmount());
            if (bank != null && flow.signum() != 0) {
                bankCardService.recordExternal(bank.getId(), flow.signum() > 0, flow.abs(), v.getVoucherDate(), memo, entry, username);
            }
            return;
        }
        boolean in = v.getType() == FastVoucherType.DEPOSIT_REPORT;
        java.util.Map<Long, BigDecimal> byBank = new java.util.LinkedHashMap<>();
        for (FastVoucherLine l : v.getLines()) {
            BankAccount b = l.isOwnSettlement() ? l.getBankAccount() : bank;
            if (b != null) byBank.merge(b.getId(), l.getAmount(), BigDecimal::add);
        }
        byBank.forEach((bankId, amt) -> {
            if (amt.signum() != 0) bankCardService.recordExternal(bankId, in, amt, v.getVoucherDate(), memo, entry, username);
        });
    }

    /**
     * 현금거래 한 장짜리 입력(매출처로부터 · 계좌간이동 …). 원본 2026-10-12 loginaa 에서 종류마다 한 장씩 저장해
     * 전표를 열어 본 그대로 분개한다(FastVoucherType 주석). 머리 계좌는 [입금계좌] 또는 [출금계좌] — 비우면 000 현금.
     * 회계거래조회 [금액]은 금액+수수료다(은행차입으로 50,000 · 수수료 1,000 → 51,000).
     */
    private void applyCashQuick(FastVoucher v, CreateVoucherRequest req, String username) {
        FastVoucherType t = v.getType();
        if (req.lines() == null || req.lines().isEmpty() || req.lines().get(0).amount() == null) {
            throw ApiException.badRequest("금액: 자료를 입력 바랍니다.");
        }
        LineInput in = req.lines().get(0);
        BigDecimal amount = in.amount();
        BigDecimal fee = req.fee() != null ? req.fee() : BigDecimal.ZERO;
        if (t == FastVoucherType.OTHER_DEPOSIT) fee = BigDecimal.ZERO;   // 기타입금에는 [수수료] 칸이 없다

        BankAccount main = req.bankAccountId() != null ? bankAccount(req.bankAccountId()) : null;
        BankAccount counter = req.counterBankAccountId() != null ? bankAccount(req.counterBankAccountId()) : null;
        if (t == FastVoucherType.OTHER_WITHDRAW && main == null && fee.signum() > 0) {
            throw ApiException.badRequest("현금일경우 수수료를 입력할 수 없습니다.");
        }
        switch (t) {
            case ACCOUNT_TRANSFER -> { if (counter == null) throw ApiException.badRequest("출금계좌: 자료를 입력 바랍니다."); }
            case BANK_BORROWING -> {
                if (counter == null) throw ApiException.badRequest("차입처(은행): 자료를 입력 바랍니다.");
                if (fee.compareTo(amount) > 0) throw ApiException.badRequest("수수료가 총차입금보다 클 수 없습니다.");
            }
            case LOAN_REPAYMENT -> { if (counter == null) throw ApiException.badRequest("차입처: 자료를 입력 바랍니다."); }
            case TEMP_DEPOSIT, TEMP_WITHDRAW -> { if (req.employeeId() == null) throw ApiException.badRequest("사원: 자료를 입력 바랍니다."); }
            case CARD_BILL_PAYMENT -> { if (req.creditCardId() == null) throw ApiException.badRequest("카드: 자료를 입력 바랍니다."); }
            case CARD_SALES_COLLECTION -> { if (req.cardIssuerId() == null) throw ApiException.badRequest("카드사: 자료를 입력 바랍니다."); }
            case SALES_COLLECTION, PURCHASE_PAYMENT -> { if (req.partnerId() == null) throw ApiException.badRequest("거래처: 자료를 입력 바랍니다."); }
            case OTHER_DEPOSIT -> { if (in.accountId() == null) throw ApiException.badRequest("대변계정: 자료를 입력 바랍니다."); }
            case OTHER_WITHDRAW -> { if (in.accountId() == null) throw ApiException.badRequest("차변계정: 자료를 입력 바랍니다."); }
            default -> { }
        }

        var card = req.creditCardId() != null ? creditCardRepository.findById(req.creditCardId())
                .orElseThrow(() -> ApiException.notFound("카드를 찾을 수 없습니다. id=" + req.creditCardId())) : null;
        var issuer = req.cardIssuerId() != null ? cardIssuerRepository.findById(req.cardIssuerId())
                .orElseThrow(() -> ApiException.notFound("카드사를 찾을 수 없습니다. id=" + req.cardIssuerId())) : null;

        v.setMethod(main != null ? PaymentMethod.BANK : PaymentMethod.CASH);
        v.setBankAccount(main);
        v.setCounterBankAccount(counter);
        v.setCreditCard(card);
        v.setCardIssuer(issuer);
        v.setEmployeeId(req.employeeId());
        v.setFeeRate(t == FastVoucherType.CARD_SALES_COLLECTION ? req.feeRate() : null);
        v.setFee(fee);
        v.setAdvanceAmount(null);
        v.setDescription(null);
        v.setPartner(req.partnerId() != null ? partner(req.partnerId()) : null);
        // 원본 회계거래조회 [거래처명]: 사원 이름 · 카드사 · 카드 · 차입처 계좌명.
        v.setPayeeName(switch (t) {
            case TEMP_DEPOSIT, TEMP_WITHDRAW -> req.payeeName() != null && !req.payeeName().isBlank() ? req.payeeName().trim() : null;
            case CARD_SALES_COLLECTION -> issuer.getName();
            case CARD_BILL_PAYMENT -> card.getCardName();
            case BANK_BORROWING, LOAN_REPAYMENT -> FastVoucherDtos.bankName(counter);
            case ACCOUNT_TRANSFER -> main != null ? FastVoucherDtos.bankName(main) : "현금";
            default -> null;
        });
        v.setTotalAmount(amount.add(fee));

        Account a = main != null ? main.getGlAccount() : account(CASH);
        Account other = switch (t) {
            case SALES_COLLECTION -> account(RECEIVABLE);
            case CARD_SALES_COLLECTION -> account(OTHER_RECEIVABLE);
            case TEMP_DEPOSIT, TEMP_WITHDRAW -> account(ADVANCE);
            case PURCHASE_PAYMENT -> account("251");
            case CARD_BILL_PAYMENT -> account(PAYABLE);
            case ACCOUNT_TRANSFER, BANK_BORROWING, LOAN_REPAYMENT -> counter.getGlAccount();
            default -> account(in.accountId());
        };
        v.addLine(FastVoucherLine.builder()
                .account(other).amount(amount).description(in.description())
                .ownSettlement(true).bankAccount(main).build());

        Account feeAcc = (t == FastVoucherType.BANK_BORROWING || t == FastVoucherType.LOAN_REPAYMENT)
                ? account(INTEREST) : account(FEE);
        BigDecimal gross = amount.add(fee);
        List<JournalService.Posting> ps = switch (t) {
            case BANK_BORROWING -> List.of(
                    new JournalService.Posting(true, a, amount.subtract(fee)),
                    new JournalService.Posting(true, feeAcc, fee),
                    new JournalService.Posting(false, other, amount));
            case OTHER_DEPOSIT -> List.of(
                    new JournalService.Posting(true, a, amount),
                    new JournalService.Posting(false, other, amount));
            default -> t.isCashIn()
                    ? List.of(new JournalService.Posting(true, a, amount),
                              new JournalService.Posting(true, feeAcc, fee),
                              new JournalService.Posting(false, other, gross))
                    : List.of(new JournalService.Posting(true, other, amount),
                              new JournalService.Posting(true, feeAcc, fee),
                              new JournalService.Posting(false, a, gross));
        };
        JournalEntry entry = journalService.createFromPostings(v, ps);
        v.setJournalEntry(entry);

        // 계좌 잔액 · 입출금 내역 — 분개의 계좌 줄과 같은 금액으로.
        String memo = t.getDisplayName() + " " + v.getVoucherNo();
        if (main != null) {
            BigDecimal flow = t == FastVoucherType.BANK_BORROWING ? amount.subtract(fee)
                    : t.isCashIn() ? amount : gross;
            if (flow.signum() > 0) bankCardService.recordExternal(main.getId(), t.isCashIn(), flow, v.getVoucherDate(), memo, entry, username);
        }
        // 차입처는 빌린 돈의 장부 자리라 예금 잔액을 움직이지 않는다(잔액이 음수가 될 수 없어 차입이 막힌다) — 분개만 선다.
        if (counter != null && t == FastVoucherType.ACCOUNT_TRANSFER) {
            bankCardService.recordExternal(counter.getId(), false, gross, v.getVoucherDate(), memo, entry, username);
        }
    }

    private BankAccount bankAccount(Long id) {
        return bankAccountRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("계좌를 찾을 수 없습니다. id=" + id));
    }

    private BusinessPartner partner(Long id) {
        return partnerRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + id));
    }

    /** 결제수단이 실제로 서는 계정 */
    private Account settlementAccount(FastVoucherType type, PaymentMethod method, BankAccount bank) {
        return switch (method) {
            case CASH -> account(CASH);
            case BANK -> bank.getGlAccount();
            case CREDIT -> type == FastVoucherType.DEPOSIT_REPORT ? account(RECEIVABLE) : account(PAYABLE);
        };
    }

    private Account account(Long id) {
        return accountRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("계정과목을 찾을 수 없습니다. id=" + id));
    }

    private Account account(String code) {
        return accountRepository.findByCode(code)
                .orElseThrow(() -> ApiException.badRequest("계정과목이 없습니다: " + code));
    }
}
