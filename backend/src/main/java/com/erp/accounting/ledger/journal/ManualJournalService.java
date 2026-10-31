package com.erp.accounting.ledger.journal;

import com.erp.accounting.fund.bankcard.BankCardService;
import com.erp.accounting.ledger.journal.dto.JournalDtos.CreateJournalRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 일반전표(E010201) 저장 · 수정 · 삭제 — 분개(JournalService)와 통장 잔액(BankCardService)을 한 트랜잭션으로 묶는다.
 *
 * <p>보통예금 줄 거래처에 계좌를 붙이면 그 통장 잔액이 움직인다(원본 일반전표 11/28-1, 2026-10-29 데이터이관 QA 루프 70~71 —
 * 우리는 일반전표 보통예금 대변이 통장 잔액에 안 들어가 원장과 6,294,000 어긋났다). BankCardService 가 JournalService 를
 * 쓰므로 JournalService 가 거꾸로 BankCardService 를 들 수 없어 여기서 잇는다.
 */
@Service
@RequiredArgsConstructor
public class ManualJournalService {

    private final JournalService journalService;
    private final BankCardService bankCardService;
    private final JournalEntryRepository entryRepository;

    @Transactional
    public JournalEntry create(CreateJournalRequest req, String username) {
        JournalEntry e = journalService.createManual(req, username);
        bankCardService.syncJournalBank(e, username);
        return e;
    }

    @Transactional
    public JournalEntry update(Long id, CreateJournalRequest req, String username) {
        JournalEntry e = journalService.updateManual(id, req, username);
        bankCardService.syncJournalBank(e, username);
        return e;
    }

    /** 일반전표를 지우면 그 전표가 움직인 통장 잔액도 되돌린다(내역은 남기고 반대 내역을 더한다 — reverseExternal). */
    @Transactional
    public void delete(Long id, String username) {
        entryRepository.findById(id)
                .filter(e -> e.getSourceType() == JournalSourceType.MANUAL)
                .ifPresent(e -> bankCardService.syncJournalBankRemoved(e, username));
        journalService.deleteManual(id);
    }
}
