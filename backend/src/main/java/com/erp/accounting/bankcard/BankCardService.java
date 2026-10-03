package com.erp.accounting.bankcard;

import com.erp.accounting.journal.JournalService;
import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.accounting.account.Account;
import com.erp.trade.partner.BusinessPartner;
import com.erp.accounting.journal.JournalEntry;
import com.erp.accounting.bankcard.dto.BankCardDtos.BankAccountRequest;
import com.erp.accounting.bankcard.dto.BankCardDtos.BankAccountResponse;
import com.erp.accounting.bankcard.dto.BankCardDtos.BankTxnRequest;
import com.erp.accounting.bankcard.dto.BankCardDtos.BankTxnResponse;
import com.erp.accounting.bankcard.dto.BankCardDtos.CardUsageRequest;
import com.erp.accounting.bankcard.dto.BankCardDtos.CardUsageResponse;
import com.erp.accounting.bankcard.dto.BankCardDtos.CreditCardRequest;
import com.erp.accounting.bankcard.dto.BankCardDtos.CreditCardResponse;
import com.erp.accounting.account.AccountRepository;
import com.erp.trade.partner.BusinessPartnerRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.List;
import com.erp.accounting.bankcard.dto.BankCardDtos;

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
    private final CardPaymentRepository paymentRepository;
    private final com.erp.accounting.income.IncomeRepository incomeRepository;
    private final AccountRepository accountRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final JournalService journalService;
    private final DocumentNoGenerator docNoGenerator;
    private final com.erp.settings.currency.CurrencyService currencyService;

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
                .code(req.code())
                .name(req.name())
                .bankName(req.bankName())
                .accountNo(req.accountNo())
                .holder(req.holder())
                .glAccount(glAccount(req.glAccountId()))
                .currency(currency(req.currencyId()))
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
        b.setCode(req.code());
        b.setName(req.name());
        b.setBankName(req.bankName());
        b.setAccountNo(req.accountNo());
        b.setHolder(req.holder());
        b.setGlAccount(glAccount(req.glAccountId()));
        b.setCurrency(currency(req.currencyId()));
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
                .code(req.code())
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
        c.setCode(req.code());
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

    /** 한 번에 내려보낼 줄 수의 문턱. 원본 [오천건이상조회] 와 같은 자리다. */
    public static final int TXN_PAGE_ROWS = 5000;

    @Transactional(readOnly = true)
    public BankCardDtos.BankTxnListResponse findTxns(boolean all) {
        return findTxns(all, null, null);
    }

    /**
     * 예금출납장. <b>기간을 서버가 받는다.</b>
     *
     * <p>화면은 조건 판에 [기간]을 물어 놓고 서버에는 아무것도 안 보내, 전 기간
     * <b>5,000줄·2MB</b> 를 받아 브라우저에서 걸렀다. 기타이동·판매에서 고친 것과 같은 일이다.
     *
     * <p>안 주면 <b>넓은 경계</b>로 채운다 — <code>:from is null or …</code> 로 쓰면
     * PostgreSQL 이 파라미터 타입을 못 정해 42P18 로 터진다.
     */
    @Transactional(readOnly = true)
    public BankCardDtos.BankTxnListResponse findTxns(boolean all,
                                                     java.time.LocalDate from, java.time.LocalDate to) {
        java.time.LocalDate f = from != null ? from : java.time.LocalDate.of(1900, 1, 1);
        java.time.LocalDate t = to != null ? to : java.time.LocalDate.of(9999, 12, 31);
        long totalRows = txnRepository.countAll(f, t);
        boolean truncated = !all && totalRows > TXN_PAGE_ROWS;
        List<com.erp.accounting.bankcard.BankTransaction> found = truncated
                ? txnRepository.findByIdsWithRefs(txnRepository.findIdsPaged(f, t,
                        org.springframework.data.domain.PageRequest.of(0, TXN_PAGE_ROWS)))
                : txnRepository.findAllWithRefs(f, t);
        return new BankCardDtos.BankTxnListResponse(
                found.stream().map(BankTxnResponse::from).toList(), totalRows, truncated);
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

    /**
     * 다른 전표(계좌간이동·카드대금결제)가 만든 계좌 이동을 그 전표를 지울 때 되돌린다(QA 56회차 — 지울 길이 없었다).
     *
     * <p>원래 입출금 내역은 <b>지우지 않는다</b> — 그 뒤 내역의 잔액이 그 줄을 딛고 있다. 분개 연결만 끊고
     * 같은 날짜로 반대 내역을 더한다. 되돌릴 돈이 그 계좌에 없으면(이미 써 버렸으면) 잔액 부족으로 막힌다.
     */
    @Transactional
    public void reverseExternal(JournalEntry entry, String description, String username) {
        if (entry == null) return;
        for (BankTransaction t : txnRepository.findByJournalEntryId(entry.getId())) {
            t.setJournalEntry(null);
            recordExternal(t.getBankAccount().getId(), !t.isDeposit(), t.getAmount(), t.getTxnDate(),
                    description, null, username);
        }
    }

    /**
     * 계좌입출금(이 화면에서 직접 넣은 것) 삭제 — QA 62~63회차. 잘못 넣으면 반대로 한 번 더 넣어야 했다.
     *
     * <p>다른 전표가 만든 입출금(계좌간이동·카드대금결제·간편전표 = 상대계정 없음, 수입의 계좌입금,
     * 어음 만기결제·할인 = 상대계정이 받을어음·지급어음)은 <b>그 전표에서</b> 지운다 — 여기서 지우면
     * 그 전표만 남아 장부가 어긋난다.
     *
     * <p>줄을 지우고 그 뒤 줄들의 거래후 잔액을 그만큼 옮긴다. 입금을 지울 때 그 돈을 이미 썼으면
     * (뒤 어느 시점 잔액이 음수가 되면) 막는다.
     */
    @Transactional
    public void deleteTxn(Long id) {
        BankTransaction t = txnRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("입출금 내역을 찾을 수 없습니다. id=" + id));
        String code = t.getCounterAccount() == null ? null : t.getCounterAccount().getCode();
        boolean fromIncome = t.getJournalEntry() != null && incomeRepository.existsByJournalEntryId(t.getJournalEntry().getId());
        if (code == null || fromIncome || "110".equals(code) || "252".equals(code)) {
            throw ApiException.badRequest(t.getTxnNo() + " 은(는) 다른 전표(" + (fromIncome ? "수입"
                    : code == null ? "계좌간이동·카드대금결제·간편전표" : "어음") + ")가 만든 입출금입니다 — 그 전표에서 지우세요.");
        }
        BankAccount b = bankAccountRepository.findForUpdate(t.getBankAccount().getId())
                .orElseThrow(() -> ApiException.notFound("계좌를 찾을 수 없습니다."));
        BigDecimal effect = t.isDeposit() ? t.getAmount() : t.getAmount().negate();
        BigDecimal later = txnRepository.minBalanceAfterLater(b.getId(), t.getId());
        if (b.getBalance().subtract(effect).signum() < 0 || (later != null && later.subtract(effect).signum() < 0)) {
            throw ApiException.badRequest(String.format(
                    "%s 의 입금 %s 을(를) 그 뒤에 이미 써서 지우면 잔액이 음수가 됩니다 — 뒤 출금부터 지우세요.",
                    t.getTxnNo(), t.getAmount().stripTrailingZeros().toPlainString()));
        }
        txnRepository.shiftBalanceAfterLater(b.getId(), t.getId(), effect);
        b.setBalance(b.getBalance().subtract(effect));
        JournalEntry entry = t.getJournalEntry();
        txnRepository.delete(t);
        journalService.deleteEntry(entry);
    }

    // ── 카드사용 ──────────────────────────────────────────────────────

    /** 카드사용 삭제 — 아직 대금결제에 안 묶였을 때만. 분개(비용/미지급금)도 같이 지운다. */
    @Transactional
    public void deleteUsage(Long id) {
        CardUsage u = usageRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("카드사용 내역을 찾을 수 없습니다. id=" + id));
        if (paymentRepository.isUsagePaid(id)) {
            throw ApiException.badRequest(u.getUsageNo() + " 은(는) 이미 대금결제된 사용내역입니다 — 대금결제를 먼저 지우세요.");
        }
        JournalEntry entry = u.getJournalEntry();
        usageRepository.delete(u);
        journalService.deleteEntry(entry);
    }

    @Transactional(readOnly = true)
    public List<CardUsageResponse> findUsages() {
        return findUsages(null, null);
    }

    /**
     * 화면 조건 판의 <b>[기간]</b>. 예전에는 물어보지도 않고 전 기간을 통째로 주었다.
     *
     * <p>안 주면 <b>넓은 경계</b>로 채운다 — <code>:from is null or …</code> 로 쓰면
     * PostgreSQL 이 파라미터 타입을 못 정해 42P18 로 터진다.
     */
    @Transactional(readOnly = true)
    public List<CardUsageResponse> findUsages(java.time.LocalDate from, java.time.LocalDate to) {
        return usageRepository.findAllWithRefs(
                from != null ? from : java.time.LocalDate.of(1900, 1, 1),
                to != null ? to : java.time.LocalDate.of(9999, 12, 31)).stream().map(CardUsageResponse::from).toList();
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

    /** 원본 [외화통장환종]. 안 주면 null — 원화 통장이다. */
    private com.erp.settings.currency.Currency currency(Long id) {
        if (id == null) return null;
        return currencyService.get(id);
    }
}
