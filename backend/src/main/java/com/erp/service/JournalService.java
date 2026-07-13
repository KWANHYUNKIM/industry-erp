package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.Account;
import com.erp.domain.Expense;
import com.erp.domain.JournalEntry;
import com.erp.domain.JournalLine;
import com.erp.domain.JournalSourceType;
import com.erp.domain.Purchase;
import com.erp.domain.Sales;
import com.erp.repository.AccountRepository;
import com.erp.repository.JournalEntryRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

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

    private static boolean isPositive(BigDecimal v) {
        return v != null && v.compareTo(BigDecimal.ZERO) > 0;
    }

    private static boolean isOnCredit(String paymentMethod) {
        if (paymentMethod == null) return false;
        return paymentMethod.contains("외상") || paymentMethod.contains("미지급") || paymentMethod.contains("카드");
    }
}
