package com.erp.accounting.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.accounting.domain.Account;
import com.erp.trade.domain.BusinessPartner;
import com.erp.accounting.domain.Expense;
import com.erp.accounting.domain.JournalEntry;
import com.erp.accounting.domain.JournalLine;
import com.erp.accounting.domain.JournalSourceType;
import com.erp.trade.domain.Purchase;
import com.erp.trade.domain.Sales;
import com.erp.accounting.dto.JournalDtos.CashTxnRequest;
import com.erp.accounting.dto.JournalDtos.CreateJournalRequest;
import com.erp.accounting.dto.JournalDtos.ManualLineInput;
import com.erp.accounting.repository.AccountRepository;
import com.erp.trade.repository.BusinessPartnerRepository;
import com.erp.accounting.repository.JournalEntryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import com.erp.accounting.domain.AccountTransfer;
import com.erp.accounting.domain.BankCheck;
import com.erp.accounting.domain.BankTransaction;
import com.erp.accounting.domain.CardPayment;
import com.erp.accounting.domain.CardUsage;
import com.erp.accounting.domain.Depreciation;
import com.erp.accounting.domain.FastVoucher;
import com.erp.accounting.domain.FastVoucherLine;
import com.erp.accounting.domain.FixedAsset;
import com.erp.accounting.domain.NonCashTransaction;
import com.erp.accounting.domain.PromissoryNote;
import com.erp.accounting.domain.enums.CheckType;
import com.erp.accounting.dto.JournalDtos;
import com.erp.hr.domain.PayrollTransfer;

/**
 * 회계전표(분개) 생성. 판매/매입/지출 업무전표를 복식부기 분개로 옮긴다.
 *
 * 표준 계정코드(한국 상거래 관행):
 *   108 외상매출금 · 401 상품매출 · 255 부가세예수금
 *   146 상품 · 135 부가세대급금 · 251 외상매입금
 *   101 현금 · 253 미지급금
 */
@Service
@RequiredArgsConstructor
public class JournalService {


    private final DocumentNoGenerator docNoGenerator;
    private final JournalEntryRepository entryRepository;
    private final AccountRepository accountRepository;
    private final BusinessPartnerRepository partnerRepository;

    /** 일반전표 직접입력. 사용자가 차/대변 라인을 입력하며, 차변합=대변합이어야 저장된다. */
    @Transactional
    public JournalEntry createManual(CreateJournalRequest req, String username) {
        List<ManualLineInput> inputs = req.lines();
        if (inputs == null || inputs.size() < 2) {
            throw ApiException.badRequest("분개는 차변·대변 최소 2줄이 필요합니다.");
        }
        LocalDate date = req.entryDate() != null ? req.entryDate() : LocalDate.now();
        JournalEntry e = newEntry(JournalSourceType.MANUAL, null, date,
                req.description(), resolvePartner(req.partnerId()), username);

        for (ManualLineInput in : inputs) {
            BigDecimal debit = nz(in.debit());
            BigDecimal credit = nz(in.credit());
            boolean hasDebit = debit.signum() > 0;
            boolean hasCredit = credit.signum() > 0;
            if (hasDebit == hasCredit) {   // 둘 다 있거나 둘 다 없음
                throw ApiException.badRequest("각 라인은 차변 또는 대변 한쪽만 입력하세요.");
            }
            e.addLine(JournalLine.builder()
                    .account(account(in.accountId())).debit(debit).credit(credit)
                    .description(in.description()).build());
        }
        return save(e);
    }

    /** 현금거래 간편입력. 입금 → 차)현금·대)상대계정, 출금 → 차)상대계정·대)현금. */
    @Transactional
    public JournalEntry createCashTxn(CashTxnRequest req, String username) {
        if (nz(req.amount()).signum() <= 0) {
            throw ApiException.badRequest("금액은 0보다 커야 합니다.");
        }
        LocalDate date = req.entryDate() != null ? req.entryDate() : LocalDate.now();
        Account cash = account("101");
        Account counter = account(req.counterAccountId());
        String desc = req.description() != null ? req.description()
                : (req.deposit() ? "현금입금" : "현금출금");

        JournalEntry e = newEntry(JournalSourceType.MANUAL, null, date, desc,
                resolvePartner(req.partnerId()), username);
        if (Boolean.TRUE.equals(req.deposit())) {
            e.addLine(line(cash, req.amount(), BigDecimal.ZERO, desc));
            e.addLine(line(counter, BigDecimal.ZERO, req.amount(), desc));
        } else {
            e.addLine(line(counter, req.amount(), BigDecimal.ZERO, desc));
            e.addLine(line(cash, BigDecimal.ZERO, req.amount(), desc));
        }
        return save(e);
    }

    /** 수동전표 삭제. 업무전표에서 자동생성된 전표는 회계반영취소로만 지운다. */
    @Transactional
    public void deleteManual(Long id) {
        JournalEntry e = entryRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("회계전표를 찾을 수 없습니다. id=" + id));
        if (e.getSourceType() != JournalSourceType.MANUAL) {
            throw ApiException.badRequest("업무전표에서 생성된 회계전표는 회계반영 취소로만 삭제할 수 있습니다.");
        }
        entryRepository.delete(e);
    }

    private JournalLine line(Account account, BigDecimal debit, BigDecimal credit, String desc) {
        return JournalLine.builder().account(account).debit(debit).credit(credit).description(desc).build();
    }

    private BusinessPartner resolvePartner(Long id) {
        if (id == null) return null;
        return partnerRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + id));
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }

    /** 판매 → 분개. 차)외상매출금 / 대)상품매출·부가세예수금 */
    @Transactional
    public JournalEntry createFromSales(Sales s) {
        if (entryRepository.existsBySourceTypeAndSourceId(JournalSourceType.SALES, s.getId())) {
            throw ApiException.conflict("이미 회계반영된 판매전표입니다: " + s.getDocNo());
        }
        JournalEntry e = newEntry(JournalSourceType.SALES, s.getId(), s.getSaleDate(),
                "판매 " + s.getDocNo(), s.getPartner(), s.getCreatedBy());

        addDebit(e, "108", s.getTotalAmount(), "외상매출금");
        addCredit(e, "401", s.getSupplyAmount(), "상품매출");
        if (isPositive(s.getVatAmount())) {
            addCredit(e, "255", s.getVatAmount(), "부가세예수금");
        }
        return save(e);
    }

    /** 매입 → 분개. 차)상품·부가세대급금 / 대)외상매입금 */
    @Transactional
    public JournalEntry createFromPurchase(Purchase p) {
        if (entryRepository.existsBySourceTypeAndSourceId(JournalSourceType.PURCHASE, p.getId())) {
            throw ApiException.conflict("이미 회계반영된 구매전표입니다: " + p.getDocNo());
        }
        JournalEntry e = newEntry(JournalSourceType.PURCHASE, p.getId(), p.getPurchaseDate(),
                "구매 " + p.getDocNo(), p.getPartner(), p.getCreatedBy());

        addDebit(e, "146", p.getSupplyAmount(), "상품");
        if (isPositive(p.getVatAmount())) {
            addDebit(e, "135", p.getVatAmount(), "부가세대급금");
        }
        addCredit(e, "251", p.getTotalAmount(), "외상매입금");
        return save(e);
    }

    /** 지출 → 분개. 차)비용계정 / 대)현금 (paymentMethod 가 '외상/미지급'이면 미지급금) */
    @Transactional
    public JournalEntry createFromExpense(Expense x) {
        if (entryRepository.existsBySourceTypeAndSourceId(JournalSourceType.EXPENSE, x.getId())) {
            throw ApiException.conflict("이미 회계반영된 지출전표입니다.");
        }
        Account expenseAccount = x.getAccount();
        if (expenseAccount == null) {
            throw ApiException.badRequest("지출전표에 비용 계정이 지정되어 있지 않습니다.");
        }
        JournalEntry e = newEntry(JournalSourceType.EXPENSE, x.getId(), x.getExpenseDate(),
                x.getContent() != null ? x.getContent() : "지출", null, x.getCreatedBy());

        addDebitAccount(e, expenseAccount, x.getAmount(), x.getContent());
        String credit = isOnCredit(x.getPaymentMethod()) ? "253" : "101";
        addCredit(e, credit, x.getAmount(), isOnCredit(x.getPaymentMethod()) ? "미지급금" : "현금");
        return save(e);
    }

    /**
     * 계좌 입출금 → 분개.
     * 입금: 차)예금계정 / 대)상대계정, 출금: 차)상대계정 / 대)예금계정.
     * 전표번호가 아직 없는(저장 전) 거래를 받으므로 sourceId 는 채우지 않고, 호출부가 연결을 건다.
     */
    @Transactional
    public JournalEntry createFromBankTxn(com.erp.accounting.domain.BankTransaction t) {
        Account bank = t.getBankAccount().getGlAccount();
        Account counter = t.getCounterAccount();
        String desc = t.getDescription() != null ? t.getDescription()
                : (t.isDeposit() ? "계좌입금" : "계좌출금") + " " + t.getTxnNo();

        JournalEntry e = newEntry(JournalSourceType.BANK, null, t.getTxnDate(), desc, t.getPartner(), t.getCreatedBy());
        if (t.isDeposit()) {
            e.addLine(line(bank, t.getAmount(), BigDecimal.ZERO, desc));
            e.addLine(line(counter, BigDecimal.ZERO, t.getAmount(), desc));
        } else {
            e.addLine(line(counter, t.getAmount(), BigDecimal.ZERO, desc));
            e.addLine(line(bank, BigDecimal.ZERO, t.getAmount(), desc));
        }
        return save(e);
    }

    /** 카드사용 → 분개. 차)비용계정·부가세대급금 / 대)미지급금 (결제일에 계좌에서 빠질 때까지 미지급금) */
    @Transactional
    public JournalEntry createFromCardUsage(com.erp.accounting.domain.CardUsage u) {
        String desc = u.getMerchant() + (u.getDescription() != null ? " " + u.getDescription() : "");
        JournalEntry e = newEntry(JournalSourceType.CARD, null, u.getUsageDate(), desc, null, u.getCreatedBy());

        addDebitAccount(e, u.getExpenseAccount(), u.getSupplyAmount(), desc);
        if (isPositive(u.getVatAmount())) {
            addDebit(e, "135", u.getVatAmount(), "부가세대급금");
        }
        addCredit(e, "253", u.getTotalAmount(), "미지급금 (" + u.getCard().getCardName() + ")");
        return save(e);
    }

    /**
     * 어음 → 분개. 현금이 오가지 않는 단계만 여기서 만든다.
     *   수취/발행  받을어음: 차)받을어음 / 대)외상매출금    지급어음: 차)외상매입금 / 대)지급어음
     *   할인료     차)매출채권처분손실 / 대)받을어음        (예금 입금분은 계좌 입출금이 따로 분개한다)
     *   부도       차)외상매출금 / 대)받을어음              (어음채권을 외상매출금으로 환원)
     *
     * 만기결제와 할인 입금은 계좌 잔액이 함께 움직이므로 BankCardService 의 입출금을 거친다
     * (그쪽이 잔액 잠금·부족 검증을 소유한다). 그래서 여기에는 예금 분개가 없다.
     */
    @Transactional
    public JournalEntry createFromNote(com.erp.accounting.domain.PromissoryNote n, NoteEvent event) {
        boolean receivable = n.getType().isReceivable();
        LocalDate date = event == NoteEvent.ISSUE ? n.getIssueDate() : n.getClosedDate();
        String desc = n.getType().getDisplayName() + " " + event.getDisplayName() + " " + n.getNoteNo();

        // (source_type, source_id) 는 유니크다 — 한 업무전표에 회계전표는 하나라는 규칙이다.
        // 어음은 수취/발행 이후에도 할인료·부도로 전표가 더 붙으므로, 어음을 대표하는 수취 전표에만
        // sourceId 를 건다. 나머지는 계좌입출금 전표와 같이 적요의 어음번호로 추적한다.
        Long sourceId = event == NoteEvent.ISSUE ? n.getId() : null;
        JournalEntry e = newEntry(JournalSourceType.NOTE, sourceId, date, desc, n.getPartner(), n.getCreatedBy());

        switch (event) {
            case ISSUE -> {
                if (receivable) {
                    addDebit(e, "110", n.getAmount(), "받을어음");
                    addCredit(e, "108", n.getAmount(), "외상매출금 회수");
                } else {
                    addDebit(e, "251", n.getAmount(), "외상매입금 결제");
                    addCredit(e, "252", n.getAmount(), "지급어음");
                }
            }
            case DISCOUNT_FEE -> {
                BigDecimal fee = nz(n.getDiscountFee());
                addDebit(e, "936", fee, "매출채권처분손실(할인료)");
                addCredit(e, "110", fee, "받을어음");
            }
            case DISHONOR -> {
                addDebit(e, "108", n.getAmount(), "부도어음 → 외상매출금 환원");
                addCredit(e, "110", n.getAmount(), "받을어음");
            }
        }
        return save(e);
    }

    /** 어음 처리 단계 중 현금이 오가지 않는 것들. */
    public enum NoteEvent {
        ISSUE("수취/발행"), DISCOUNT_FEE("할인료"), DISHONOR("부도");

        private final String displayName;

        NoteEvent(String displayName) {
            this.displayName = displayName;
        }

        public String getDisplayName() {
            return displayName;
        }
    }

    /** 감가상각 → 분개. 차)감가상각비 / 대)감가상각누계액 */
    @Transactional
    public JournalEntry createFromDepreciation(com.erp.accounting.domain.Depreciation d) {
        com.erp.accounting.domain.FixedAsset asset = d.getAsset();
        String desc = "감가상각 " + d.getPeriod() + " " + asset.getName();

        JournalEntry e = newEntry(JournalSourceType.DEPRECIATION, asset.getId(), d.getDepreciationDate(),
                desc, null, d.getCreatedBy());
        addDebit(e, "818", d.getAmount(), "감가상각비");
        addCredit(e, "203", d.getAmount(), "감가상각누계액");
        return save(e);
    }

    /**
     * 고정자산 처분 → 분개.
     * 차)감가상각누계액·현금(처분가)·유형자산처분손실 / 대)자산계정·유형자산처분이익
     * 처분손익 = 처분가액 - 장부가액.
     */
    @Transactional
    public JournalEntry createFromDisposal(com.erp.accounting.domain.FixedAsset asset) {
        BigDecimal cost = asset.getAcquisitionCost();
        BigDecimal accumulated = asset.getAccumulatedDepreciation();
        BigDecimal proceeds = asset.getDisposalAmount();
        BigDecimal gain = proceeds.subtract(cost.subtract(accumulated));   // 처분가 - 장부가
        String desc = "자산처분 " + asset.getAssetNo() + " " + asset.getName();

        JournalEntry e = newEntry(JournalSourceType.DISPOSAL, asset.getId(), asset.getDisposalDate(),
                desc, null, asset.getCreatedBy());
        if (isPositive(accumulated)) {
            addDebit(e, "203", accumulated, "감가상각누계액 제거");
        }
        if (isPositive(proceeds)) {
            addDebit(e, "101", proceeds, "처분대금");
        }
        if (gain.signum() < 0) {
            addDebit(e, "970", gain.negate(), "유형자산처분손실");
        }
        addCreditAccount(e, asset.getAssetAccount(), cost, "자산 제거");
        if (gain.signum() > 0) {
            addCredit(e, "914", gain, "유형자산처분이익");
        }
        return save(e);
    }

    /**
     * FastEntry 간편전표 → 분개.
     *   지출결의서       차)비용라인들 / 대)결제수단(현금·예금·미지급금)
     *   입금보고서       차)입금수단(현금·예금·외상매출금) / 대)수입라인들
     *   가지급금정산서   차)사용비용라인들 (+반납액) / 대)가지급금 (+추가지급액)
     * settlement 은 결제수단이 실제로 서는 계정(현금 101 / 계좌의 예금계정 / 253·108)이다.
     */
    @Transactional
    public JournalEntry createFromVoucher(com.erp.accounting.domain.FastVoucher v, Account settlement) {
        String desc = v.getDescription() != null ? v.getDescription()
                : v.getType().getDisplayName() + " " + v.getVoucherNo();
        JournalEntry e = newEntry(JournalSourceType.VOUCHER, null, v.getVoucherDate(),
                desc, v.getPartner(), v.getCreatedBy());

        switch (v.getType()) {
            case EXPENSE_REPORT -> {
                v.getLines().forEach(l -> addDebitAccount(e, l.getAccount(), l.getAmount(), lineDesc(l)));
                addCreditAccount(e, settlement, v.getTotalAmount(), settlement.getName());
            }
            case DEPOSIT_REPORT -> {
                addDebitAccount(e, settlement, v.getTotalAmount(), settlement.getName());
                v.getLines().forEach(l -> addCreditAccount(e, l.getAccount(), l.getAmount(), lineDesc(l)));
            }
            case ADVANCE_SETTLEMENT -> {
                v.getLines().forEach(l -> addDebitAccount(e, l.getAccount(), l.getAmount(), lineDesc(l)));
                BigDecimal balance = v.getAdvanceAmount().subtract(v.getTotalAmount());
                if (balance.signum() > 0) {                 // 덜 썼다 → 잔액 반납
                    addDebitAccount(e, settlement, balance, "가지급금 반납");
                } else if (balance.signum() < 0) {          // 더 썼다 → 추가 지급
                    addCreditAccount(e, settlement, balance.negate(), "추가 지급");
                }
                addCredit(e, "134", v.getAdvanceAmount(), "가지급금 정산");
            }
        }
        return save(e);
    }

    private static String lineDesc(com.erp.accounting.domain.FastVoucherLine l) {
        return l.getDescription() != null ? l.getDescription() : l.getAccount().getName();
    }

    /** 비현금거래(대체전표) → 분개. 차변계정 하나 / 대변계정 하나. */
    @Transactional
    public JournalEntry createFromNonCash(com.erp.accounting.domain.NonCashTransaction t) {
        String desc = t.getDescription() != null ? t.getDescription()
                : t.getType().getDisplayName() + " " + t.getTxnNo();

        JournalEntry e = newEntry(JournalSourceType.NONCASH, null, t.getTxnDate(), desc, t.getPartner(), t.getCreatedBy());
        addDebitAccount(e, t.getDebitAccount(), t.getAmount(), desc);
        addCreditAccount(e, t.getCreditAccount(), t.getAmount(), desc);
        return save(e);
    }

    /**
     * 수표 → 분개.
     *   받은수표 수취   차)받을수표   / 대)외상매출금
     *   발행수표 발행   차)외상매입금 / 대)발행계좌의 예금계정 (당좌수표는 끊는 순간 예금이 빠진다)
     *   받은수표 입금   차)입금계좌의 예금계정 / 대)받을수표
     *   받은수표 부도   차)외상매출금 / 대)받을수표 (현금은 움직이지 않는다)
     * 한 수표가 전표를 여러 장 만들므로 sourceId 는 최초 수취/발행에만 채운다
     * (중복반영 방지 유니크 인덱스는 source_id IS NOT NULL 에만 걸린다).
     */
    @Transactional
    public JournalEntry createFromCheckIssue(com.erp.accounting.domain.BankCheck c) {
        boolean received = c.getType() == com.erp.accounting.domain.enums.CheckType.RECEIVED;
        String desc = c.getType().getDisplayName() + " " + c.getCheckNo();

        JournalEntry e = newEntry(JournalSourceType.CHECK, c.getId(), c.getIssueDate(), desc, c.getPartner(), c.getCreatedBy());
        if (received) {
            addDebit(e, "104", c.getAmount(), "받을수표");
            addCredit(e, "108", c.getAmount(), "외상매출금");
        } else {
            addDebit(e, "251", c.getAmount(), "외상매입금");
            addCreditAccount(e, c.getBankAccount().getGlAccount(), c.getAmount(), "수표 발행");
        }
        return save(e);
    }

    /** 받은수표 입금 → 차)예금계정 / 대)받을수표 */
    @Transactional
    public JournalEntry createFromCheckDeposit(com.erp.accounting.domain.BankCheck c, LocalDate date, String username) {
        String desc = "수표 입금 " + c.getCheckNo();
        JournalEntry e = newEntry(JournalSourceType.CHECK, null, date, desc, c.getPartner(), username);
        addDebitAccount(e, c.getBankAccount().getGlAccount(), c.getAmount(), desc);
        addCredit(e, "104", c.getAmount(), "받을수표");
        return save(e);
    }

    /** 받은수표 부도 → 차)외상매출금 / 대)받을수표 (채권으로 되돌린다) */
    @Transactional
    public JournalEntry createFromCheckDishonor(com.erp.accounting.domain.BankCheck c, LocalDate date, String username) {
        String desc = "수표 부도 " + c.getCheckNo();
        JournalEntry e = newEntry(JournalSourceType.CHECK, null, date, desc, c.getPartner(), username);
        addDebit(e, "108", c.getAmount(), "외상매출금 환원");
        addCredit(e, "104", c.getAmount(), "받을수표");
        return save(e);
    }

    /**
     * 급여이체 → 분개.
     *   차) 급여(801) 지급총액
     *   대) 예수금(254) 공제합계   — 4대보험·소득세는 회사가 떼어 두었다가 나중에 납부한다
     *   대) 예금계정 실지급액       — 계좌에서 실제로 나가는 금액
     */
    @Transactional
    public JournalEntry createFromPayrollTransfer(com.erp.hr.domain.PayrollTransfer t) {
        String desc = "급여이체 " + t.getPayMonth() + " " + t.getTransferNo();

        JournalEntry e = newEntry(JournalSourceType.PAYROLL, null, t.getTransferDate(), desc, null, t.getCreatedBy());
        addDebit(e, "801", t.getTotalPay(), "급여");
        if (isPositive(t.getTotalDeduction())) {
            addCredit(e, "254", t.getTotalDeduction(), "예수금 (4대보험·소득세)");
        }
        addCreditAccount(e, t.getBankAccount().getGlAccount(), t.getNetPay(), "실지급액");
        return save(e);
    }

    /**
     * 계좌간이동 → 분개. 차)입금계좌 예금계정 / 대)출금계좌 예금계정.
     * 회사 밖으로 나가는 돈이 아니라 손익에 영향이 없다.
     */
    @Transactional
    public JournalEntry createFromAccountTransfer(com.erp.accounting.domain.AccountTransfer t) {
        String desc = t.getDescription() != null ? t.getDescription() : "계좌간이동 " + t.getTransferNo();

        JournalEntry e = newEntry(JournalSourceType.ACCOUNT_TRANSFER, t.getId(), t.getTransferDate(),
                desc, null, t.getCreatedBy());
        addDebitAccount(e, t.getToAccount().getGlAccount(), t.getAmount(), "입금 " + t.getToAccount().getBankName());
        addCreditAccount(e, t.getFromAccount().getGlAccount(), t.getAmount(), "출금 " + t.getFromAccount().getBankName());
        return save(e);
    }

    /**
     * 법인카드 대금결제 → 분개. 차)미지급금(253) / 대)결제계좌 예금계정.
     * 카드사용 시점에 이미 비용과 미지급금을 잡아 두었으므로, 결제는 그 미지급금을 갚는 것뿐이다.
     */
    @Transactional
    public JournalEntry createFromCardPayment(com.erp.accounting.domain.CardPayment p) {
        String desc = "카드대금 결제 " + p.getCard().getCardName() + " " + p.getPaymentNo();

        JournalEntry e = newEntry(JournalSourceType.CARD_PAYMENT, p.getId(), p.getPaymentDate(),
                desc, null, p.getCreatedBy());
        addDebit(e, "253", p.getAmount(), "미지급금 상환");
        addCreditAccount(e, p.getBankAccount().getGlAccount(), p.getAmount(), "카드대금 출금");
        return save(e);
    }

    /** 회계반영 취소: 업무전표에 연결된 회계전표 삭제 */
    @Transactional
    public void deleteBySource(JournalSourceType type, Long sourceId) {
        entryRepository.findBySourceTypeAndSourceId(type, sourceId)
                .ifPresent(entryRepository::delete);
    }

    // ── 내부 ──────────────────────────────────────────────────────────

    private JournalEntry newEntry(JournalSourceType type, Long sourceId, LocalDate date,
                                  String desc, com.erp.trade.domain.BusinessPartner partner, String createdBy) {
        return JournalEntry.builder()
                // 채번은 공용 DocumentNoGenerator 에 맡긴다. 여기서 직접 max+1 을 하면
                // 동시에 전표를 만드는 두 트랜잭션이 같은 번호를 받아 unique 제약에서 터진다.
                .docNo(docNoGenerator.next("GL-", "journal_entries", "doc_no", "entry_date", date))
                .entryDate(date)
                .description(desc)
                .partner(partner)
                .sourceType(type)
                .sourceId(sourceId)
                .createdBy(createdBy)
                .build();
    }

    private void addDebit(JournalEntry e, String code, BigDecimal amount, String desc) {
        addDebitAccount(e, account(code), amount, desc);
    }

    private void addDebitAccount(JournalEntry e, Account account, BigDecimal amount, String desc) {
        e.addLine(JournalLine.builder()
                .account(account).debit(amount).credit(BigDecimal.ZERO).description(desc).build());
    }

    private void addCredit(JournalEntry e, String code, BigDecimal amount, String desc) {
        addCreditAccount(e, account(code), amount, desc);
    }

    private void addCreditAccount(JournalEntry e, Account account, BigDecimal amount, String desc) {
        e.addLine(JournalLine.builder()
                .account(account).debit(BigDecimal.ZERO).credit(amount).description(desc).build());
    }

    private JournalEntry save(JournalEntry e) {
        if (!e.isBalanced()) {
            throw ApiException.badRequest(
                    "분개가 대차평형을 이루지 않습니다. 차변 " + e.totalDebit() + " ≠ 대변 " + e.totalCredit());
        }
        return entryRepository.save(e);
    }

    private Account account(String code) {
        return accountRepository.findByCode(code)
                .orElseThrow(() -> ApiException.badRequest("계정과목이 없습니다: " + code + " (계정과목등록 필요)"));
    }

    private Account account(Long id) {
        return accountRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("계정과목을 찾을 수 없습니다. id=" + id));
    }

    private static boolean isPositive(BigDecimal v) {
        return v != null && v.compareTo(BigDecimal.ZERO) > 0;
    }

    private static boolean isOnCredit(String paymentMethod) {
        if (paymentMethod == null) return false;
        return paymentMethod.contains("외상") || paymentMethod.contains("미지급") || paymentMethod.contains("카드");
    }
}
