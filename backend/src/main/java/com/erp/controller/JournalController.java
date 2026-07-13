package com.erp.controller;

import com.erp.dto.JournalDtos.AccountLedgerResponse;
import com.erp.dto.JournalDtos.BalanceSheetResponse;
import com.erp.dto.JournalDtos.CashTxnRequest;
import com.erp.dto.JournalDtos.CreateJournalRequest;
import com.erp.dto.JournalDtos.IncomeStatementResponse;
import com.erp.dto.JournalDtos.JournalEntryResponse;
import com.erp.dto.JournalDtos.TrialBalanceResponse;
import com.erp.security.UserPrincipal;
import com.erp.service.JournalQueryService;
import com.erp.service.JournalService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/**
 * 회계 조회: 회계전표 목록/상세, 계정별원장, 합계잔액시산표, 재무상태표, 손익계산서.
 * 전표 생성은 판매/구매의 회계반영(/api/accounting-reflection)에서 자동으로 이뤄진다.
 */
@RestController
@RequestMapping("/api/journals")
@RequiredArgsConstructor
public class JournalController {

    private final JournalQueryService service;
    private final JournalService journalService;

    /** 일반전표 직접입력 */
    @PostMapping
    public ResponseEntity<JournalEntryResponse> createManual(
            @Valid @RequestBody CreateJournalRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        var entry = journalService.createManual(req, principal.getUsername());
        return ResponseEntity.ok(JournalEntryResponse.from(entry));
    }

    /** 현금거래 간편입력 */
    @PostMapping("/cash")
    public ResponseEntity<JournalEntryResponse> createCash(
            @Valid @RequestBody CashTxnRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        var entry = journalService.createCashTxn(req, principal.getUsername());
        return ResponseEntity.ok(JournalEntryResponse.from(entry));
    }

    /** 수동전표 삭제 (업무전표 생성분은 회계반영취소로만) */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        journalService.deleteManual(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    public List<JournalEntryResponse> entries(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.entries(from, to);
    }

    @GetMapping("/{id}")
    public JournalEntryResponse entry(@PathVariable Long id) {
        return service.entry(id);
    }

    /** 계정별원장 */
    @GetMapping("/ledger")
    public AccountLedgerResponse ledger(
            @RequestParam Long accountId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.accountLedger(accountId, from, to);
    }

    /** 합계잔액시산표 */
    @GetMapping("/trial-balance")
    public TrialBalanceResponse trialBalance(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.trialBalance(from, to);
    }

    /** 재무상태표 */
    @GetMapping("/balance-sheet")
    public BalanceSheetResponse balanceSheet(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf) {
        return service.balanceSheet(asOf);
    }

    /** 손익계산서 */
    @GetMapping("/income-statement")
    public IncomeStatementResponse incomeStatement(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.incomeStatement(from, to);
    }
}
