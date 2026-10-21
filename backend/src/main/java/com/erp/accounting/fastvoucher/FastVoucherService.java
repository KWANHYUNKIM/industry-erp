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
    /* 채권감소등록 [입금보고서작성] · 수령수표입금처리 [입금보고서작성]으로 만든 입금보고서의 '추가정보'(채권 감소 · 수령수표) — 수정 검증용. */
    private final com.erp.accounting.bond.BondEntryRepository bondEntryRepository;
    private final com.erp.accounting.bankcheck.BankCheckRepository bankCheckRepository;
    /* 받을어음 · 지급어음일괄감소 [입금보고서작성] · [지출결의서작성] 으로 닫힌 어음 — 수정 때 떼었다가 다시 건다(V420 트리거). */
    private final com.erp.accounting.promissorynote.PromissoryNoteRepository noteRepository;

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
        requireExtraInfoMatches(v, req);
        /* 수령수표입금처리로 손을 떠난 수표는 이 전표의 회계전표를 가리킨다. 옛 회계전표를 지우면 트리거
           (bank_checks_release_settle_journal)가 수표를 보유로 되돌리므로, 지우기 전에 떼었다가 새 회계전표에 다시 건다. */
        List<com.erp.accounting.bankcheck.BankCheck> checks = v.getJournalEntry() == null ? List.of()
                : bankCheckRepository.findBySettleJournalId(v.getJournalEntry().getId());
        checks.forEach(c -> c.setSettleJournalId(null));
        List<com.erp.accounting.promissorynote.PromissoryNote> notes = v.getJournalEntry() == null ? List.of()
                : noteRepository.findByCloseJournalEntryId(v.getJournalEntry().getId());
        notes.forEach(n -> n.setCloseJournalEntry(null));
        /* 원본은 고쳐 저장해도 전표번호가 그대로다(2026-10-21 loginaa 매입처로 26/10/21-10 21,500 → 30,500, 번호 -10 그대로).
           우리는 옛 분개를 지우고 새로 만들어 번호가 그날 끝 번호로 바뀌었다(-3 → -6) — 같은 날이면 옛 번호를 다시 쓴다.
           옛 분개의 delete 는 아래 flush 에서 먼저 나가므로 unique 에 걸리지 않는다. */
        String oldDocNo = v.getJournalEntry() == null ? null : v.getJournalEntry().getDocNo();
        LocalDate oldDate = v.getJournalEntry() == null ? null : v.getJournalEntry().getEntryDate();
        undo(v, username);
        v.getLines().clear();
        voucherRepository.flush();
        if (req.method() != null) v.setMethod(req.method());
        apply(v, req, username);
        JournalEntry renewed = v.getJournalEntry();
        if (oldDocNo != null && renewed != null && renewed.getEntryDate().equals(oldDate)) renewed.setDocNo(oldDocNo);
        if (!checks.isEmpty()) {
            Long journalId = v.getJournalEntry().getId();
            checks.forEach(c -> c.setSettleJournalId(journalId));
        }
        notes.forEach(n -> n.setCloseJournalEntry(v.getJournalEntry()));
        return VoucherResponse.from(v);
    }

    /**
     * 채권감소등록 [입금보고서작성](채무감소 [지출결의서작성]) · 수령수표입금처리 [입금보고서작성]으로 만든 전표는 줄마다 '추가정보'
     * (채권번호별 감소 금액 · 수령수표)를 들고 있다. 원본(2026-10-13 loginaa, 회계2 채권감소등록 E060402 실측)은 그 전표를 열어
     * 금액만 고쳐 저장하면 '금액과 추가정보의 합계액이 일치하지 않은 분개가 있습니다.' 로 막는다 — 감소 내역 · 수표와 금액이 어긋나지 않게.
     * 분개 하나 = 같은 계정 · 거래처(수표는 거래처) 줄 묶음.
     */
    private void requireExtraInfoMatches(FastVoucher v, CreateVoucherRequest req) {
        java.util.Map<String, BigDecimal> extra = new java.util.HashMap<>();
        boolean byPartnerOnly = false;
        for (com.erp.accounting.bond.BondLine l : bondEntryRepository.findLinesBySourceVoucher(v.getId())) {
            extra.merge(key(l.getAccount().getId(), l.getPartner() == null ? null : l.getPartner().getId()), l.getAmount(), BigDecimal::add);
        }
        if (extra.isEmpty() && v.getJournalEntry() != null) {
            for (com.erp.accounting.bankcheck.BankCheck c : bankCheckRepository.findBySettleJournalId(v.getJournalEntry().getId())) {
                extra.merge(key(null, c.getPartner() == null ? null : c.getPartner().getId()), c.getAmount(), BigDecimal::add);
                byPartnerOnly = true;
            }
        }
        if (extra.isEmpty()) return;
        java.util.Map<String, BigDecimal> lines = new java.util.HashMap<>();
        for (LineInput l : req.lines() == null ? List.<LineInput>of() : req.lines()) {
            if (l.amount() == null) continue;
            lines.merge(key(byPartnerOnly ? null : l.accountId(), l.partnerId()), l.amount(), BigDecimal::add);
        }
        java.util.Set<String> keys = new java.util.HashSet<>(extra.keySet());
        keys.addAll(lines.keySet());
        for (String k : keys) {
            if (extra.getOrDefault(k, BigDecimal.ZERO).compareTo(lines.getOrDefault(k, BigDecimal.ZERO)) != 0) {
                throw ApiException.badRequest("금액과 추가정보의 합계액이 일치하지 않은 분개가 있습니다.");
            }
        }
    }

    private static String key(Long accountId, Long partnerId) {
        return accountId + ":" + partnerId;
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
        /* 원본 한 장 입력 머리의 [부서] · [프로젝트] — 고른 그대로 남긴다(결의서 격자 화면은 보내지 않아 비어 있다). */
        v.setDepartmentId(req.departmentId());
        v.setProjectId(req.projectId());
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
        boolean allOwn = req.lines().stream().allMatch(l -> Boolean.TRUE.equals(l.cash()) || l.bankAccountId() != null || l.settleAccountId() != null);
        if (method == PaymentMethod.BANK && !allOwn) {
            if (req.bankAccountId() == null) {
                throw ApiException.badRequest("계좌를 선택하세요.");
            }
            bank = bankAccount(req.bankAccountId());
        }

        BigDecimal advance = null;
        // 원본 가지급금정산서(E010505)는 줄마다 [정산자] 사원을 고르고 차) 줄 계정 / 대) 가지급금 으로 끝난다 —
        // 돈이 오가지 않는다. 예전 화면은 머리에 [가지급금] 총액을 받아 반납 · 추가지급까지 분개했다(advanceAmount).
        boolean perEmployee = v.getType() == FastVoucherType.ADVANCE_SETTLEMENT && req.advanceAmount() == null;
        if (perEmployee) {
            if (req.lines().stream().anyMatch(l -> l.employeeId() == null)) {
                throw ApiException.badRequest("정산자: 자료를 입력 바랍니다.");
            }
            method = PaymentMethod.CASH;
            v.setMethod(method);
        } else if (v.getType() == FastVoucherType.ADVANCE_SETTLEMENT) {
            if (req.advanceAmount().signum() <= 0) {
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
            boolean own = Boolean.TRUE.equals(in.cash()) || in.bankAccountId() != null || in.settleAccountId() != null;
            FastVoucherDtos.LineVat vat = in.vat();
            if (vat != null) {
                // 원본 [추가정보]는 지출결의서 · 가지급금정산서의 매입 부가세다(입금보고서는 다른 것 — 못 잼).
                if (v.getType() != FastVoucherType.EXPENSE_REPORT && v.getType() != FastVoucherType.ADVANCE_SETTLEMENT) {
                    throw ApiException.badRequest("이 전표에는 부가세 추가정보를 넣을 수 없습니다.");
                }
                // 원본은 적용하면 줄 금액이 공급가액 + 부가세가 된다 — 어긋나면 받지 않는다.
                if (vat.supply().add(vat.vat() != null ? vat.vat() : BigDecimal.ZERO).compareTo(in.amount()) != 0) {
                    throw ApiException.badRequest("금액과 추가정보의 합계액이 일치하지 않은 분개가 있습니다.");
                }
            }
            v.addLine(FastVoucherLine.builder()
                    .account(account(in.accountId()))
                    .amount(in.amount())
                    .description(in.description())
                    .ownSettlement(own)
                    .bankAccount(in.bankAccountId() != null ? bankAccount(in.bankAccountId()) : null)
                    .partner(in.partnerId() != null ? partner(in.partnerId()) : null)
                    .employeeId(perEmployee ? in.employeeId() : null)
                    .employeeName(perEmployee && in.employeeName() != null ? in.employeeName().trim() : null)
                    .vatType(vat != null ? vat.vatType().trim() : null)
                    .vatDate(vat != null ? (vat.vatDate() != null ? vat.vatDate() : v.getVoucherDate()) : null)
                    .vatPartner(vat != null ? partner(vat.partnerId()) : null)
                    .vatSupply(vat != null ? vat.supply() : null)
                    .vatAmount(vat != null ? (vat.vat() != null ? vat.vat() : BigDecimal.ZERO) : null)
                    .settleAccount(in.settleAccountId() != null ? account(in.settleAccountId()) : null)
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
            // 가지급금정산서: 원본 회계거래조회 [거래처명]은 정산자 이름이다(26/10/12-17 · 고준희).
            v.setPayeeName(perEmployee ? v.getLines().get(0).getEmployeeName() : null);
            v.setFee(BigDecimal.ZERO);
        }
        // 원본 회계거래조회 [거래처명]은 줄의 거래처다(26/10/13-2 지출결의서 · 스타벅스). 머리에 없으면 첫 거래처 줄.
        v.setPartner(headPartner);

        Account headSettlement = settlementAccount(v.getType(), method, bank);
        JournalEntry entry = journalService.createFromVoucher(v, headSettlement,
                l -> l.isOwnSettlement() ? (l.getSettleAccount() != null ? l.getSettleAccount()
                        : l.getBankAccount() != null ? l.getBankAccount().getGlAccount() : account(CASH)) : headSettlement);
        v.setJournalEntry(entry);

        // 계좌로 냈거나 받았으면 잔액과 입출금 내역도 움직인다(분개는 위에서 이미 만들었으므로 재생성하지 않는다).
        String memo = v.getType().getDisplayName() + " " + v.getVoucherNo();
        if (perEmployee) return;   // 가지급금을 비용으로 바꿀 뿐 — 계좌는 움직이지 않는다
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
            case RECEIPT_ONLY -> {
                if (in.accountId() == null) throw ApiException.badRequest("계정: 자료를 입력 바랍니다.");
                if (req.employeeId() == null) throw ApiException.badRequest("사원: 자료를 입력 바랍니다.");
            }
            case CARD_SLIP -> {
                if (req.creditCardId() == null) throw ApiException.badRequest("카드: 자료를 입력 바랍니다.");
                if (in.accountId() == null) throw ApiException.badRequest("계정: 자료를 입력 바랍니다.");
            }
            case NONCASH_OTHER -> {
                if (in.accountId() == null) throw ApiException.badRequest("차변계정: 자료를 입력 바랍니다.");
                if (req.lines().size() < 2 || req.lines().get(1).accountId() == null) throw ApiException.badRequest("대변계정: 자료를 입력 바랍니다.");
            }
            default -> { }
        }
        // 비현금거래는 돈이 오가지 않는다 — 머리 계좌 · 수수료를 받지 않는다.
        if (t.isNonCash()) {
            main = null;
            counter = null;
            fee = BigDecimal.ZERO;
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
            // 일반영수증 · 신용카드전표 [거래처명]은 친 글자 그대로(원본 회계거래조회 'QA회계1-카드').
            case RECEIPT_ONLY, CARD_SLIP -> req.payeeName() != null && !req.payeeName().isBlank() ? req.payeeName().trim() : null;
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

        if (t.isNonCash()) {
            // 원본(2026-10-13 저장해 전표 인쇄로 봄): 일반영수증 차) 복리후생비 1,000 / 대) 가지급금(고준희) 1,000,
            // 신용카드전표 차) 복리후생비 1,100 / 대) 미지급금(하나SK5533) 1,100, 기타 차) 복리후생비 500 / 대) 미지급금 500.
            Account credit = switch (t) {
                case RECEIPT_ONLY -> account(ADVANCE);
                case CARD_SLIP -> account(PAYABLE);
                default -> account(req.lines().get(1).accountId());
            };
            if (t == FastVoucherType.NONCASH_OTHER) {
                // 대변계정을 둘째 줄로 남긴다 — 수정 창이 다시 채운다.
                v.addLine(FastVoucherLine.builder()
                        .account(credit).amount(amount).description(in.description())
                        .ownSettlement(true).build());
            }
            JournalEntry entry = journalService.createFromPostings(v, List.of(
                    new JournalService.Posting(true, other, amount),
                    new JournalService.Posting(false, credit, amount)));
            v.setJournalEntry(entry);
            return;
        }

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
