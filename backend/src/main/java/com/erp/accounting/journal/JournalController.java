package com.erp.accounting.journal;

import com.erp.accounting.journal.dto.JournalDtos.AccountLedgerResponse;
import com.erp.accounting.journal.dto.JournalDtos.BalanceSheetResponse;
import com.erp.accounting.journal.dto.JournalDtos.GroupedAccountSum;
import com.erp.accounting.journal.dto.JournalDtos.CashTxnRequest;
import com.erp.accounting.journal.dto.JournalDtos.CreateJournalRequest;
import com.erp.accounting.journal.dto.JournalDtos.IncomeStatementResponse;
import com.erp.accounting.journal.dto.JournalDtos.JournalEntryResponse;
import com.erp.accounting.journal.dto.JournalDtos.TrialBalanceResponse;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import com.erp.accounting.journal.dto.JournalDtos;

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
    private final JournalCodeChangeService codeChangeService;

    /** 각종코드변경(E010111) [변경] — 바꾼 줄 수를 돌려준다. */
    @PostMapping("/code-change")
    public java.util.Map<String, Integer> codeChange(@Valid @RequestBody JournalDtos.CodeChangeRequest req) {
        return java.util.Map.of("changed", codeChangeService.change(req));
    }

    /** 일반전표 직접입력 */
    @PostMapping
    public ResponseEntity<JournalEntryResponse> createManual(
            @Valid @RequestBody CreateJournalRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        var entry = journalService.createManual(req, principal.getUsername());
        return ResponseEntity.ok(JournalEntryResponse.from(entry));
    }

    /** 일반전표 수정 창 [저장(F8)] */
    @PutMapping("/{id}")
    public JournalEntryResponse updateManual(@PathVariable Long id,
                                             @Valid @RequestBody CreateJournalRequest req,
                                             @AuthenticationPrincipal UserPrincipal principal) {
        return JournalEntryResponse.from(journalService.updateManual(id, req, principal.getUsername()));
    }

    /** 회계 I › 매출/매입거래 › 매출전표 I · 매입전표 I */
    @PostMapping("/vat-slip")
    public JournalEntryResponse vatSlip(@Valid @RequestBody com.erp.accounting.journal.dto.JournalDtos.VatSlipRequest req,
                                        @AuthenticationPrincipal UserPrincipal principal) {
        return JournalEntryResponse.from(journalService.createVatSlip(req, principal.getUsername()));
    }

    /** 매출전표 I(수정) · 매입전표 I 수정 창 [저장(F8)] */
    @PutMapping("/vat-slip/{id}")
    public JournalEntryResponse updateVatSlip(@PathVariable Long id,
                                              @Valid @RequestBody com.erp.accounting.journal.dto.JournalDtos.VatSlipRequest req,
                                              @AuthenticationPrincipal UserPrincipal principal) {
        return JournalEntryResponse.from(journalService.updateVatSlip(id, req, principal.getUsername()));
    }

    /** 현금거래 간편입력 */
    @PostMapping("/cash")
    public ResponseEntity<JournalEntryResponse> createCash(
            @Valid @RequestBody CashTxnRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        var entry = journalService.createCashTxn(req, principal.getUsername());
        return ResponseEntity.ok(JournalEntryResponse.from(entry));
    }

    /** 회계거래조회 [확인] · [확인취소] */
    @PostMapping("/status")
    public JournalDtos.ChangeStatusResponse changeStatus(@Valid @RequestBody JournalDtos.ChangeStatusRequest req,
                                                         @AuthenticationPrincipal UserPrincipal principal) {
        return new JournalDtos.ChangeStatusResponse(journalService.changeStatus(req.ids(), req.status(), principal.getUsername()));
    }

    /** 수동전표 삭제 (업무전표 생성분은 회계반영취소로만) */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        journalService.deleteManual(id);
        return ResponseEntity.noContent().build();
    }

    @GetMapping
    public com.erp.accounting.journal.dto.JournalDtos.JournalListResponse entries(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            /* 원본 [오천건이상조회] — 문턱 위로는 눌러야 간다. */
            @RequestParam(defaultValue = "false") boolean all) {
        return service.entries(from, to, all);
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
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) Long projectId) {
        return service.accountLedger(accountId, from, to, departmentId, projectId);
    }

    /** 합계잔액시산표 */
    @GetMapping("/trial-balance")
    public TrialBalanceResponse trialBalance(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) Long projectId) {
        return service.trialBalance(from, to, departmentId, projectId);
    }

    /** 재무상태표 */
    @GetMapping("/balance-sheet")
    public BalanceSheetResponse balanceSheet(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) Long projectId) {
        return service.balanceSheet(asOf, departmentId, projectId);
    }

    /** 재무제표 · 원가명세서 [부서표시방법] · [프로젝트표시방법] 종 · 횡 — 부서(프로젝트)마다 계정 합 */
    @GetMapping("/account-sums-by")
    public List<GroupedAccountSum> accountSumsBy(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam String by,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) Long projectId) {
        return service.accountSumsBy(from, to, by, departmentId, projectId);
    }

    /** 손익계산서 */
    @GetMapping("/income-statement")
    public IncomeStatementResponse incomeStatement(
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long departmentId,
            @RequestParam(required = false) Long projectId) {
        return service.incomeStatement(from, to, departmentId, projectId);
    }
}
