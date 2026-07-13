package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.Account;
import com.erp.domain.BusinessPartner;
import com.erp.domain.Expense;
import com.erp.domain.JournalEntry;
import com.erp.domain.JournalLine;
import com.erp.domain.JournalSourceType;
import com.erp.domain.Purchase;
import com.erp.domain.Sales;
import com.erp.dto.JournalDtos.CashTxnRequest;
import com.erp.dto.JournalDtos.CreateJournalRequest;
import com.erp.dto.JournalDtos.ManualLineInput;
import com.erp.repository.AccountRepository;
import com.erp.repository.BusinessPartnerRepository;
import com.erp.repository.JournalEntryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.List;

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

    private static final DateTimeFormatter DOC_DATE = DateTimeFormatter.BASIC_ISO_DATE;

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

    /** 회계반영 취소: 업무전표에 연결된 회계전표 삭제 */
    @Transactional
    public void deleteBySource(JournalSourceType type, Long sourceId) {
        entryRepository.findBySourceTypeAndSourceId(type, sourceId)
                .ifPresent(entryRepository::delete);
    }

    // ── 내부 ──────────────────────────────────────────────────────────

    private JournalEntry newEntry(JournalSourceType type, Long sourceId, LocalDate date,
                                  String desc, com.erp.domain.BusinessPartner partner, String createdBy) {
        int seq = entryRepository.maxSeq(date) + 1;
        return JournalEntry.builder()
                .docNo("GL-" + date.format(DOC_DATE) + "-" + String.format("%04d", seq))
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
        e.addLine(JournalLine.builder()
                .account(account(code)).debit(BigDecimal.ZERO).credit(amount).description(desc).build());
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
