package com.erp.accounting.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.accounting.domain.Account;
import com.erp.accounting.domain.BankAccount;
import com.erp.accounting.domain.BankTransaction;
import com.erp.trade.domain.BusinessPartner;
import com.erp.accounting.domain.CardUsage;
import com.erp.accounting.domain.CreditCard;
import com.erp.accounting.domain.JournalEntry;
import com.erp.accounting.dto.BankCardDtos.BankAccountRequest;
import com.erp.accounting.dto.BankCardDtos.BankAccountResponse;
import com.erp.accounting.dto.BankCardDtos.BankTxnRequest;
import com.erp.accounting.dto.BankCardDtos.BankTxnResponse;
import com.erp.accounting.dto.BankCardDtos.CardUsageRequest;
import com.erp.accounting.dto.BankCardDtos.CardUsageResponse;
import com.erp.accounting.dto.BankCardDtos.CreditCardRequest;
import com.erp.accounting.dto.BankCardDtos.CreditCardResponse;
import com.erp.accounting.repository.AccountRepository;
import com.erp.accounting.repository.BankAccountRepository;
import com.erp.accounting.repository.BankTransactionRepository;
import com.erp.trade.repository.BusinessPartnerRepository;
import com.erp.accounting.repository.CardUsageRepository;
import com.erp.accounting.repository.CreditCardRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import com.erp.accounting.dto.BankCardDtos;

/**
 * 회계 I > 계좌/카드 — 계좌·카드 마스터와 계좌 입출금·카드사용.
 * 입출금/카드사용은 저장과 동시에 복식부기 분개를 만든다(JournalService).
 */
@Service
@RequiredArgsConstructor
public class BankCardService {

    /** 계좌의 기본 예금계정 */
    private static final String DEFAULT_BANK_ACCOUNT_CODE = "103";

    private final BankAccountRepository bankAccountRepository;
    private final CreditCardRepository cardRepository;
    private final BankTransactionRepository txnRepository;
    private final CardUsageRepository usageRepository;
    private final AccountRepository accountRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final JournalService journalService;
    private final DocumentNoGenerator docNoGenerator;

    // ── 계좌 마스터 ────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<BankAccountResponse> findAccounts() {
        return bankAccountRepository.findAllWithAccount().stream().map(BankAccountResponse::from).toList();
    }

    @Transactional
    public BankAccountResponse createAccount(BankAccountRequest req) {
        if (bankAccountRepository.existsByAccountNo(req.accountNo())) {
            throw ApiException.conflict("이미 등록된 계좌번호입니다: " + req.accountNo());
        }
        BankAccount b = BankAccount.builder()
                .bankName(req.bankName())
                .accountNo(req.accountNo())
                .holder(req.holder())
                .glAccount(glAccount(req.glAccountId()))
                .balance(nz(req.openingBalance()))
                .active(req.active() == null || req.active())
                .remark(req.remark())
                .build();
        return BankAccountResponse.from(bankAccountRepository.save(b));
    }

    @Transactional
    public BankAccountResponse updateAccount(Long id, BankAccountRequest req) {
        BankAccount b = bankAccount(id);
        if (!b.getAccountNo().equals(req.accountNo()) && bankAccountRepository.existsByAccountNo(req.accountNo())) {
            throw ApiException.conflict("이미 등록된 계좌번호입니다: " + req.accountNo());
        }
        b.setBankName(req.bankName());
        b.setAccountNo(req.accountNo());
        b.setHolder(req.holder());
        b.setGlAccount(glAccount(req.glAccountId()));
        b.setActive(req.active() == null || req.active());
        b.setRemark(req.remark());
        // 잔액은 입출금으로만 움직인다. 여기서 openingBalance 로 덮어쓰면 수불과 어긋난다.
        return BankAccountResponse.from(b);
    }

    // ── 카드 마스터 ────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<CreditCardResponse> findCards() {
        return cardRepository.findAllWithSettlement().stream().map(CreditCardResponse::from).toList();
    }

    @Transactional
    public CreditCardResponse createCard(CreditCardRequest req) {
        if (cardRepository.existsByCardNo(req.cardNo())) {
            throw ApiException.conflict("이미 등록된 카드번호입니다: " + req.cardNo());
        }
        CreditCard c = CreditCard.builder()
                .cardName(req.cardName())
                .cardCompany(req.cardCompany())
                .cardNo(req.cardNo())
                .type(req.type())
                .ownerName(req.ownerName())
                .settlementAccount(req.settlementAccountId() != null ? bankAccount(req.settlementAccountId()) : null)
                .settlementDay(req.settlementDay())
                .active(req.active() == null || req.active())
                .remark(req.remark())
                .build();
        return CreditCardResponse.from(cardRepository.save(c));
    }

    @Transactional
    public CreditCardResponse updateCard(Long id, CreditCardRequest req) {
        CreditCard c = card(id);
        if (!c.getCardNo().equals(req.cardNo()) && cardRepository.existsByCardNo(req.cardNo())) {
            throw ApiException.conflict("이미 등록된 카드번호입니다: " + req.cardNo());
        }
        c.setCardName(req.cardName());
        c.setCardCompany(req.cardCompany());
        c.setCardNo(req.cardNo());
        c.setType(req.type());
        c.setOwnerName(req.ownerName());
        c.setSettlementAccount(req.settlementAccountId() != null ? bankAccount(req.settlementAccountId()) : null);
        c.setSettlementDay(req.settlementDay());
        c.setActive(req.active() == null || req.active());
        c.setRemark(req.remark());
        return CreditCardResponse.from(c);
    }

    // ── 계좌 입출금 ────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<BankTxnResponse> findTxns() {
        return txnRepository.findAllWithRefs().stream().map(BankTxnResponse::from).toList();
    }

    @Transactional
    public BankTxnResponse createTxn(BankTxnRequest req, String username) {
        // 잔액 행을 잠그고 읽어 동시 입출금이 서로의 잔액을 덮어쓰지 않게 한다.
        BankAccount b = bankAccountRepository.findForUpdate(req.bankAccountId())
                .orElseThrow(() -> ApiException.notFound("계좌를 찾을 수 없습니다. id=" + req.bankAccountId()));
        if (!b.isActive()) {
            throw ApiException.badRequest("사용중지된 계좌입니다: " + b.getBankName() + " " + b.getAccountNo());
        }

        BigDecimal delta = req.deposit() ? req.amount() : req.amount().negate();
        BigDecimal after = b.getBalance().add(delta);
        if (after.signum() < 0) {
            throw ApiException.badRequest(String.format("계좌 잔액이 부족합니다. 잔액 %s, 출금 %s",
                    b.getBalance().toPlainString(), req.amount().toPlainString()));
        }
        b.setBalance(after);

        LocalDate date = req.txnDate() != null ? req.txnDate() : LocalDate.now();
        BankTransaction t = BankTransaction.builder()
                .txnNo(docNoGenerator.next("BK-", "bank_transactions", "txn_no", "txn_date", date))
                .txnDate(date)
                .bankAccount(b)
                .deposit(req.deposit())
                .amount(req.amount())
                .counterAccount(account(req.counterAccountId()))
                .partner(partner(req.partnerId()))
                .balanceAfter(after)
                .description(req.description())
                .createdBy(username)
                .build();

        JournalEntry entry = journalService.createFromBankTxn(t);
        t.setJournalEntry(entry);
        return BankTxnResponse.from(txnRepository.save(t));
    }

    /**
     * 다른 전표(간편전표 등)가 만든 계좌 이동을 기록한다.
     * 분개는 호출부가 이미 만들었으므로 여기서는 잔액과 입출금 내역만 남긴다(이중 분개 방지).
     * 상대계정은 호출부의 라인이 여럿이라 비워 둔다.
     */
    @Transactional
    public BankTransaction recordExternal(Long bankAccountId, boolean deposit, BigDecimal amount,
                                          LocalDate date, String description,
                                          JournalEntry entry, String username) {
        BankAccount b = bankAccountRepository.findForUpdate(bankAccountId)
                .orElseThrow(() -> ApiException.notFound("계좌를 찾을 수 없습니다. id=" + bankAccountId));
        if (!b.isActive()) {
            throw ApiException.badRequest("사용중지된 계좌입니다: " + b.getBankName() + " " + b.getAccountNo());
        }
        BigDecimal after = b.getBalance().add(deposit ? amount : amount.negate());
        if (after.signum() < 0) {
            throw ApiException.badRequest(String.format("계좌 잔액이 부족합니다. 잔액 %s, 출금 %s",
                    b.getBalance().toPlainString(), amount.toPlainString()));
        }
        b.setBalance(after);

        BankTransaction t = BankTransaction.builder()
                .txnNo(docNoGenerator.next("BK-", "bank_transactions", "txn_no", "txn_date", date))
                .txnDate(date)
                .bankAccount(b)
                .deposit(deposit)
                .amount(amount)
                .counterAccount(null)
                .balanceAfter(after)
                .journalEntry(entry)
                .description(description)
                .createdBy(username)
                .build();
        return txnRepository.save(t);
    }

    // ── 카드사용 ──────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<CardUsageResponse> findUsages() {
        return usageRepository.findAllWithRefs().stream().map(CardUsageResponse::from).toList();
    }

    @Transactional
    public CardUsageResponse createUsage(CardUsageRequest req, String username) {
        CreditCard c = card(req.cardId());
        if (!c.isActive()) {
            throw ApiException.badRequest("사용중지된 카드입니다: " + c.getCardName());
        }
        BigDecimal supply = req.supplyAmount();
        BigDecimal vat = req.vatAmount() != null
                ? req.vatAmount()
                : supply.multiply(new BigDecimal("0.1")).setScale(2, RoundingMode.HALF_UP);

        LocalDate date = req.usageDate() != null ? req.usageDate() : LocalDate.now();
        CardUsage u = CardUsage.builder()
                .usageNo(docNoGenerator.next("CU-", "card_usages", "usage_no", "usage_date", date))
                .usageDate(date)
                .card(c)
                .merchant(req.merchant())
                .expenseAccount(account(req.expenseAccountId()))
                .supplyAmount(supply)
                .vatAmount(vat)
                .totalAmount(supply.add(vat))
                .description(req.description())
                .createdBy(username)
                .build();

        JournalEntry entry = journalService.createFromCardUsage(u);
        u.setJournalEntry(entry);
        return CardUsageResponse.from(usageRepository.save(u));
    }

    // ── 내부 ──────────────────────────────────────────────────────────

    private BankAccount bankAccount(Long id) {
        return bankAccountRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("계좌를 찾을 수 없습니다. id=" + id));
    }

    private CreditCard card(Long id) {
        return cardRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("카드를 찾을 수 없습니다. id=" + id));
    }

    private Account account(Long id) {
        return accountRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("계정과목을 찾을 수 없습니다. id=" + id));
    }

    /** 예금계정 미지정 시 보통예금(103) */
    private Account glAccount(Long id) {
        if (id != null) return account(id);
        return accountRepository.findByCode(DEFAULT_BANK_ACCOUNT_CODE)
                .orElseThrow(() -> ApiException.badRequest("계정과목이 없습니다: " + DEFAULT_BANK_ACCOUNT_CODE + " (보통예금)"));
    }

    private BusinessPartner partner(Long id) {
        if (id == null) return null;
        return partnerRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + id));
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
