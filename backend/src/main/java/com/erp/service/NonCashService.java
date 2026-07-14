package com.erp.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.domain.Account;
import com.erp.domain.JournalEntry;
import com.erp.domain.NonCashTransaction;
import com.erp.domain.enums.NonCashType;
import com.erp.dto.NonCashDtos.CreateNonCashRequest;
import com.erp.dto.NonCashDtos.NonCashResponse;
import com.erp.repository.AccountRepository;
import com.erp.repository.BankAccountRepository;
import com.erp.repository.BusinessPartnerRepository;
import com.erp.repository.NonCashTransactionRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

/**
 * 회계 I > 비현금거래(대체전표) — 현금·예금이 움직이지 않는 거래.
 * 상계·대손·미지급 계상·계정대체를 유형별 템플릿으로 받아 분개를 만든다.
 * 현금성 계정(현금·당좌예금·보통예금, 등록된 계좌의 예금계정)이 끼면 거절한다.
 */
@Service
@RequiredArgsConstructor
public class NonCashService {

    private static final String RECEIVABLE = "108";     // 외상매출금
    private static final String PAYABLE_TRADE = "251";  // 외상매입금
    private static final String PAYABLE = "253";        // 미지급금
    private static final String BAD_DEBT = "835";       // 대손상각비
    private static final Set<String> CASH_CODES = Set.of("101", "102", "103");

    private final NonCashTransactionRepository txnRepository;
    private final AccountRepository accountRepository;
    private final BankAccountRepository bankAccountRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final JournalService journalService;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public List<NonCashResponse> findAll() {
        return txnRepository.findAllWithRefs().stream().map(NonCashResponse::from).toList();
    }

    @Transactional
    public NonCashResponse create(CreateNonCashRequest req, String username) {
        Account debit;
        Account credit;
        switch (req.type()) {
            case OFFSET -> {
                debit = account(PAYABLE_TRADE);
                credit = account(RECEIVABLE);
            }
            case BAD_DEBT -> {
                debit = account(BAD_DEBT);
                credit = account(RECEIVABLE);
            }
            case ACCRUAL -> {
                debit = required(req.debitAccountId(), "비용계정(차변)을 선택하세요.");
                credit = account(PAYABLE);
            }
            case TRANSFER -> {
                debit = required(req.debitAccountId(), "차변계정을 선택하세요.");
                credit = required(req.creditAccountId(), "대변계정을 선택하세요.");
            }
            default -> throw ApiException.badRequest("알 수 없는 유형입니다.");
        }
        if (debit.getId().equals(credit.getId())) {
            throw ApiException.badRequest("차변과 대변이 같은 계정일 수 없습니다.");
        }
        rejectCash(debit);
        rejectCash(credit);

        LocalDate date = req.txnDate() != null ? req.txnDate() : LocalDate.now();
        NonCashTransaction t = NonCashTransaction.builder()
                .txnNo(docNoGenerator.next("NC-", "non_cash_transactions", "txn_no", "txn_date", date))
                .type(req.type())
                .txnDate(date)
                .debitAccount(debit)
                .creditAccount(credit)
                .amount(req.amount())
                .partner(req.partnerId() != null
                        ? partnerRepository.findById(req.partnerId())
                            .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId()))
                        : null)
                .description(req.description())
                .createdBy(username)
                .build();

        JournalEntry entry = journalService.createFromNonCash(t);
        t.setJournalEntry(entry);
        return NonCashResponse.from(txnRepository.save(t));
    }

    /** 현금성 계정이 끼면 비현금거래가 아니다. */
    private void rejectCash(Account a) {
        if (CASH_CODES.contains(a.getCode()) || bankGlAccountIds().contains(a.getId())) {
            throw ApiException.badRequest(
                    "비현금거래에는 현금성 계정을 쓸 수 없습니다: " + a.getCode() + " " + a.getName()
                    + " (현금거래·계좌입출금 화면을 이용하세요)");
        }
    }

    private Set<Long> bankGlAccountIds() {
        return bankAccountRepository.findAllWithAccount().stream()
                .map(b -> b.getGlAccount().getId())
                .collect(Collectors.toSet());
    }

    private Account required(Long id, String message) {
        if (id == null) {
            throw ApiException.badRequest(message);
        }
        return accountRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("계정과목을 찾을 수 없습니다. id=" + id));
    }

    private Account account(String code) {
        return accountRepository.findByCode(code)
                .orElseThrow(() -> ApiException.badRequest("계정과목이 없습니다: " + code));
    }
}
