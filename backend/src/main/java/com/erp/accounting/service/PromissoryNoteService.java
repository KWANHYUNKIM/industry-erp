package com.erp.accounting.service;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.accounting.domain.Account;
import com.erp.trade.domain.BusinessPartner;
import com.erp.accounting.domain.PromissoryNote;
import com.erp.groupware.domain.enums.NoteStatus;
import com.erp.groupware.domain.enums.NoteType;
import com.erp.accounting.dto.BankCardDtos.BankTxnRequest;
import com.erp.accounting.dto.PromissoryNoteDtos.CreateNoteRequest;
import com.erp.accounting.dto.PromissoryNoteDtos.DiscountRequest;
import com.erp.accounting.dto.PromissoryNoteDtos.DishonorRequest;
import com.erp.accounting.dto.PromissoryNoteDtos.NoteResponse;
import com.erp.accounting.dto.PromissoryNoteDtos.NoteSummary;
import com.erp.accounting.dto.PromissoryNoteDtos.SettleRequest;
import com.erp.accounting.repository.AccountRepository;
import com.erp.trade.repository.BusinessPartnerRepository;
import com.erp.accounting.repository.PromissoryNoteRepository;
import com.erp.accounting.service.JournalService.NoteEvent;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import com.erp.accounting.dto.BankCardDtos;
import com.erp.accounting.dto.PromissoryNoteDtos;

/**
 * 어음거래: 받을어음 수취 / 지급어음 발행 → 만기결제 · 할인 · 부도.
 *
 * 모든 단계가 회계전표를 남긴다. 만기결제와 할인 입금은 계좌 잔액이 함께 움직이므로
 * BankCardService 의 입출금을 거친다 — 잔액 잠금과 잔액부족 검증을 그쪽이 소유하고,
 * 예금 분개도 그쪽이 만든다. 어음 계정(받을어음/지급어음)은 그 입출금의 상대계정으로 넣는다.
 */
@Service
@RequiredArgsConstructor
public class PromissoryNoteService {

    private static final String ACC_NOTES_RECEIVABLE = "110";   // 받을어음
    private static final String ACC_NOTES_PAYABLE = "252";      // 지급어음

    private final PromissoryNoteRepository noteRepository;
    private final BusinessPartnerRepository partnerRepository;
    private final AccountRepository accountRepository;
    private final JournalService journalService;
    private final BankCardService bankCardService;
    private final DocumentNoGenerator docNoGenerator;

    @Transactional(readOnly = true)
    public NoteSummary findAll() {
        List<PromissoryNote> notes = noteRepository.findAllWithPartner();
        LocalDate soon = LocalDate.now().plusDays(30);

        BigDecimal recvHeld = BigDecimal.ZERO;
        BigDecimal payHeld = BigDecimal.ZERO;
        BigDecimal recvSoon = BigDecimal.ZERO;
        BigDecimal paySoon = BigDecimal.ZERO;

        for (PromissoryNote n : notes) {
            if (n.getStatus() != NoteStatus.HELD) continue;
            boolean dueSoon = !n.getDueDate().isAfter(soon);
            if (n.getType().isReceivable()) {
                recvHeld = recvHeld.add(n.getAmount());
                if (dueSoon) recvSoon = recvSoon.add(n.getAmount());
            } else {
                payHeld = payHeld.add(n.getAmount());
                if (dueSoon) paySoon = paySoon.add(n.getAmount());
            }
        }
        return new NoteSummary(recvHeld, payHeld, recvSoon, paySoon,
                notes.stream().map(NoteResponse::from).toList());
    }

    /** 어음 수취(받을어음) / 발행(지급어음). 채권·채무가 어음으로 대체된다. */
    @Transactional
    public NoteResponse create(CreateNoteRequest req, String username) {
        BusinessPartner partner = partnerRepository.findById(req.partnerId())
                .orElseThrow(() -> ApiException.notFound("거래처를 찾을 수 없습니다. id=" + req.partnerId()));
        LocalDate issueDate = req.issueDate() != null ? req.issueDate() : LocalDate.now();
        if (req.dueDate().isBefore(issueDate)) {
            throw ApiException.badRequest("만기일이 발행일보다 빠를 수 없습니다.");
        }

        PromissoryNote n = PromissoryNote.builder()
                .noteNo(docNoGenerator.next("BN-", "promissory_notes", "note_no", "issue_date", issueDate))
                .type(req.type())
                .partner(partner)
                .issueDate(issueDate)
                .dueDate(req.dueDate())
                .amount(req.amount())
                .status(NoteStatus.HELD)
                .bankName(req.bankName())
                .remark(req.remark())
                .createdBy(username)
                .build();
        noteRepository.save(n);

        journalService.createFromNote(n, NoteEvent.ISSUE);
        return NoteResponse.from(n);
    }

    /** 만기결제: 받을어음이면 계좌 입금, 지급어음이면 계좌 출금. 어음이 예금으로 정리된다. */
    @Transactional
    public NoteResponse settle(Long id, SettleRequest req, String username) {
        PromissoryNote n = held(id, "결제");
        if (req == null || req.bankAccountId() == null) {
            throw ApiException.badRequest("결제될 계좌를 선택하세요.");
        }
        LocalDate date = req.settleDate() != null ? req.settleDate() : LocalDate.now();
        n.setStatus(NoteStatus.SETTLED);
        n.setClosedDate(date);

        boolean receivable = n.getType().isReceivable();
        bankCardService.createTxn(new BankTxnRequest(
                req.bankAccountId(),
                receivable,                       // 받을어음이면 입금, 지급어음이면 출금
                n.getAmount(),
                noteAccount(n).getId(),           // 상대계정 = 받을어음 / 지급어음
                n.getPartner().getId(),
                date,
                n.getType().getDisplayName() + " 만기결제 " + n.getNoteNo()
        ), username);

        return NoteResponse.from(n);
    }

    /**
     * 어음할인(받을어음 전용): 만기 전에 은행에 넘기고 할인료를 뗀 금액을 받는다.
     * 예금 입금분은 계좌 입출금이 분개하고, 할인료는 매출채권처분손실로 따로 분개한다.
     */
    @Transactional
    public NoteResponse discount(Long id, DiscountRequest req, String username) {
        PromissoryNote n = held(id, "할인");
        if (n.getType() != NoteType.RECEIVABLE) {
            throw ApiException.badRequest("지급어음은 할인할 수 없습니다. 받을어음만 할인 대상입니다.");
        }
        if (req.bankAccountId() == null) {
            throw ApiException.badRequest("할인 대금이 입금될 계좌를 선택하세요.");
        }
        BigDecimal fee = req.discountFee();
        if (fee.compareTo(n.getAmount()) >= 0) {
            throw ApiException.badRequest("할인료가 어음 금액 이상입니다. 어음 " + n.getAmount().toPlainString()
                    + ", 할인료 " + fee.toPlainString());
        }
        LocalDate date = req.discountDate() != null ? req.discountDate() : LocalDate.now();

        n.setStatus(NoteStatus.DISCOUNTED);
        n.setClosedDate(date);
        n.setDiscountFee(fee);

        // 1) 할인 대금 입금 (차)예금 / 대)받을어음)
        bankCardService.createTxn(new BankTxnRequest(
                req.bankAccountId(), true,
                n.getAmount().subtract(fee),
                noteAccount(n).getId(),
                n.getPartner().getId(),
                date,
                "어음할인 입금 " + n.getNoteNo()
        ), username);

        // 2) 할인료 (차)매출채권처분손실 / 대)받을어음)
        if (fee.signum() > 0) {
            journalService.createFromNote(n, NoteEvent.DISCOUNT_FEE);
        }
        return NoteResponse.from(n);
    }

    /** 부도(받을어음 전용): 어음채권을 외상매출금으로 되돌린다. 현금은 오가지 않는다. */
    @Transactional
    public NoteResponse dishonor(Long id, DishonorRequest req) {
        PromissoryNote n = held(id, "부도 처리");
        if (n.getType() != NoteType.RECEIVABLE) {
            throw ApiException.badRequest("지급어음은 부도 처리할 수 없습니다. 받을어음만 대상입니다.");
        }
        n.setStatus(NoteStatus.DISHONORED);
        n.setClosedDate(req != null && req.dishonorDate() != null ? req.dishonorDate() : LocalDate.now());

        journalService.createFromNote(n, NoteEvent.DISHONOR);
        return NoteResponse.from(n);
    }

    /** 어음 계정: 받을어음(110) / 지급어음(252) */
    private Account noteAccount(PromissoryNote n) {
        String code = n.getType().isReceivable() ? ACC_NOTES_RECEIVABLE : ACC_NOTES_PAYABLE;
        return accountRepository.findByCode(code)
                .orElseThrow(() -> ApiException.badRequest("계정과목이 없습니다: " + code + " (계정과목등록 필요)"));
    }

    private PromissoryNote held(Long id, String action) {
        PromissoryNote n = noteRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("어음을 찾을 수 없습니다. id=" + id));
        if (n.getStatus().isClosed()) {
            throw ApiException.conflict("이미 " + n.getStatus().getDisplayName() + " 처리된 어음입니다: "
                    + n.getNoteNo() + " (" + action + " 불가)");
        }
        return n;
    }
}
