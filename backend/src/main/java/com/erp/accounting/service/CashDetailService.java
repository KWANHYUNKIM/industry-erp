package com.erp.accounting.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.accounting.domain.AccountTransfer;
import com.erp.accounting.domain.BankAccount;
import com.erp.accounting.domain.CardPayment;
import com.erp.accounting.domain.CardPaymentLine;
import com.erp.accounting.domain.CardUsage;
import com.erp.accounting.domain.CreditCard;
import com.erp.accounting.domain.JournalEntry;
import com.erp.accounting.dto.BankCardDtos.CardUsageResponse;
import com.erp.accounting.dto.CashDetailDtos.AccountTransferRequest;
import com.erp.accounting.dto.CashDetailDtos.AccountTransferResponse;
import com.erp.accounting.dto.CashDetailDtos.CardPaymentRequest;
import com.erp.accounting.dto.CashDetailDtos.CardPaymentResponse;
import com.erp.accounting.repository.AccountTransferRepository;
import com.erp.accounting.repository.BankAccountRepository;
import com.erp.accounting.repository.CardPaymentRepository;
import com.erp.accounting.repository.CardUsageRepository;
import com.erp.accounting.repository.CreditCardRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import com.erp.accounting.dto.BankCardDtos;
import com.erp.accounting.dto.CashDetailDtos;

/**
 * 회계 I > 현금거래 세분류 — 계좌간이동 · 법인카드 대금결제.
 *
 * 두 거래 모두 계좌가 실제로 움직이므로 잔액과 입출금 내역을 남긴다.
 * 분개는 여기서 한 번만 만들고, 계좌 쪽은 BankCardService.recordExternal 로 잔액·내역만 기록한다
 * (이중 분개 방지).
 */
@Service
@RequiredArgsConstructor
public class CashDetailService {

    private final AccountTransferRepository transferRepository;
    private final CardPaymentRepository paymentRepository;
    private final CardUsageRepository usageRepository;
    private final CreditCardRepository cardRepository;
    private final BankAccountRepository bankAccountRepository;
    private final JournalService journalService;
    private final BankCardService bankCardService;
    private final DocumentNoGenerator docNoGenerator;

    // ── 계좌간이동 ────────────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<AccountTransferResponse> findTransfers() {
        return transferRepository.findAllWithRefs().stream().map(AccountTransferResponse::from).toList();
    }

    @Transactional
    public AccountTransferResponse transfer(AccountTransferRequest req, String username) {
        if (req.fromAccountId().equals(req.toAccountId())) {
            throw ApiException.badRequest("출금 계좌와 입금 계좌가 같을 수 없습니다.");
        }
        BankAccount from = bankAccount(req.fromAccountId());
        BankAccount to = bankAccount(req.toAccountId());
        LocalDate date = req.transferDate() != null ? req.transferDate() : LocalDate.now();

        AccountTransfer t = AccountTransfer.builder()
                .transferNo(docNoGenerator.next("AT-", "account_transfers", "transfer_no", "transfer_date", date))
                .transferDate(date)
                .fromAccount(from)
                .toAccount(to)
                .amount(req.amount())
                .description(req.description())
                .createdBy(username)
                .build();
        transferRepository.save(t);   // 분개가 sourceId 로 이 id 를 쓴다

        JournalEntry entry = journalService.createFromAccountTransfer(t);
        t.setJournalEntry(entry);

        // 출금 → 입금 순서. 잔액이 모자라면 출금에서 막히고 전체가 롤백된다.
        String desc = "계좌간이동 " + t.getTransferNo();
        bankCardService.recordExternal(from.getId(), false, req.amount(), date, desc, entry, username);
        bankCardService.recordExternal(to.getId(), true, req.amount(), date, desc, entry, username);

        return AccountTransferResponse.from(t);
    }

    // ── 법인카드 대금결제 ─────────────────────────────────────────────

    @Transactional(readOnly = true)
    public List<CardPaymentResponse> findPayments() {
        return paymentRepository.findAllWithRefs().stream().map(CardPaymentResponse::from).toList();
    }

    /** 아직 결제하지 않은 카드사용 (결제 화면의 대상 목록) */
    @Transactional(readOnly = true)
    public List<CardUsageResponse> unpaidUsages(Long cardId) {
        Set<Long> paid = new HashSet<>(paymentRepository.findPaidUsageIds());
        return usageRepository.findByCard(cardId).stream()
                .filter(u -> !paid.contains(u.getId()))
                .map(CardUsageResponse::from)
                .toList();
    }

    @Transactional
    public CardPaymentResponse payCard(CardPaymentRequest req, String username) {
        CreditCard card = cardRepository.findById(req.cardId())
                .orElseThrow(() -> ApiException.notFound("카드를 찾을 수 없습니다. id=" + req.cardId()));

        // 결제계좌: 요청에 없으면 카드에 등록된 결제계좌
        BankAccount account = req.bankAccountId() != null
                ? bankAccount(req.bankAccountId())
                : card.getSettlementAccount();
        if (account == null) {
            throw ApiException.badRequest("결제계좌를 선택하세요. (카드에 등록된 결제계좌가 없습니다: "
                    + card.getCardName() + ")");
        }

        Set<Long> paid = new HashSet<>(paymentRepository.findPaidUsageIds());
        List<CardUsage> targets = usageRepository.findByCard(card.getId()).stream()
                .filter(u -> !paid.contains(u.getId()))
                .filter(u -> req.cardUsageIds() == null || req.cardUsageIds().isEmpty()
                        || req.cardUsageIds().contains(u.getId()))
                .toList();

        if (targets.isEmpty()) {
            throw ApiException.badRequest(card.getCardName() + " 에 결제할 미결제 사용내역이 없습니다.");
        }

        LocalDate date = req.paymentDate() != null ? req.paymentDate() : LocalDate.now();
        BigDecimal total = targets.stream()
                .map(CardUsage::getTotalAmount)
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        CardPayment p = CardPayment.builder()
                .paymentNo(docNoGenerator.next("CP-", "card_payments", "payment_no", "payment_date", date))
                .paymentDate(date)
                .card(card)
                .bankAccount(account)
                .amount(total)
                .createdBy(username)
                .build();
        for (CardUsage u : targets) {
            p.addLine(CardPaymentLine.builder().cardUsage(u).amount(u.getTotalAmount()).build());
        }
        paymentRepository.save(p);

        JournalEntry entry = journalService.createFromCardPayment(p);
        p.setJournalEntry(entry);

        bankCardService.recordExternal(account.getId(), false, total, date,
                "카드대금 결제 " + card.getCardName() + " " + p.getPaymentNo(), entry, username);

        return CardPaymentResponse.from(p);
    }

    private BankAccount bankAccount(Long id) {
        return bankAccountRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("계좌를 찾을 수 없습니다. id=" + id));
    }
}
