package com.erp.accounting.bankcheck;

import com.erp.accounting.bankcheck.dto.BankCheckDtos.CheckResponse;
import com.erp.accounting.bankcheck.dto.BankCheckDtos.CreateCheckRequest;
import com.erp.accounting.bankcheck.dto.BankCheckDtos.DepositRequest;
import com.erp.accounting.bankcheck.dto.BankCheckDtos.SettleRequest;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.accounting.bankcheck.dto.BankCheckDtos;

/** 회계 II > 수표관리 — 받은수표(수취·입금·부도) / 발행수표(발행·결제확인) */
@RestController
@RequestMapping("/api/checks")
@RequiredArgsConstructor
public class BankCheckController {

    private final BankCheckService service;

    @GetMapping
    public List<CheckResponse> list(
            /* 화면 조건 판의 [기간] — 안 주면 전 기간이다. */
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate from,
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate to) {
        return service.findAll(from, to);
    }

    @PostMapping
    public CheckResponse create(@Valid @RequestBody CreateCheckRequest req,
                                @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, principal.getUsername());
    }

    /** 받은수표를 계좌에 입금 */
    @PostMapping("/{id}/deposit")
    public CheckResponse deposit(@PathVariable Long id, @Valid @RequestBody DepositRequest req,
                                 @AuthenticationPrincipal UserPrincipal principal) {
        return service.deposit(id, req, principal.getUsername());
    }

    /** 수령수표입금처리 [입금보고서작성] → 입금보고서 [저장] — 회계전표(입금보고서) + 고른 수표 감소 */
    @PostMapping("/deposit-report")
    public List<CheckResponse> depositReport(@Valid @RequestBody BankCheckDtos.DepositReportRequest req,
                                             @AuthenticationPrincipal UserPrincipal principal) {
        return service.depositReport(req, principal.getUsername());
    }

    /** 발행수표출금처리 [지출결의서작성] → 지출결의서 [저장] — 회계전표(지출결의서) + 고른 수표 감소 */
    @PostMapping("/withdraw-report")
    public List<CheckResponse> withdrawReport(@Valid @RequestBody BankCheckDtos.DepositReportRequest req,
                                              @AuthenticationPrincipal UserPrincipal principal) {
        return service.withdrawReport(req, principal.getUsername());
    }

    /** 받은수표 부도 */
    @PostMapping("/{id}/dishonor")
    public CheckResponse dishonor(@PathVariable Long id, @RequestBody(required = false) SettleRequest req,
                                  @AuthenticationPrincipal UserPrincipal principal) {
        return service.dishonor(id, req != null ? req : new SettleRequest(null), principal.getUsername());
    }

    /** 발행수표 은행 인출 확인 */
    @PostMapping("/{id}/settle")
    public CheckResponse settle(@PathVariable Long id, @RequestBody(required = false) SettleRequest req,
                                @AuthenticationPrincipal UserPrincipal principal) {
        return service.settle(id, req != null ? req : new SettleRequest(null), principal.getUsername());
    }

    /** 수령(발행)수표내역입력 — 분개 없이 수표만 증가 · 감소 */
    @PostMapping("/direct")
    public List<CheckResponse> directEntry(@Valid @RequestBody BankCheckDtos.DirectEntryRequest req,
                                           @AuthenticationPrincipal UserPrincipal principal) {
        return service.directEntry(req, principal.getUsername());
    }

    /** 수표조회 [일자-No.] 로 연 수표내역입력 전표 고쳐 저장 */
    @PutMapping("/direct")
    public List<CheckResponse> updateDirect(@Valid @RequestBody BankCheckDtos.DirectEditRequest req,
                                            @AuthenticationPrincipal UserPrincipal principal) {
        return service.updateDirect(req, principal.getUsername());
    }

    /** 수령(발행)수표조회 [선택삭제] — 감소 줄(입금 · 부도 · 결제 취소)과 증가 줄(수표 삭제) */
    @PostMapping("/delete")
    public void deleteMoves(@RequestBody BankCheckDtos.DeleteMovesRequest req,
                            @AuthenticationPrincipal UserPrincipal principal) {
        service.deleteMoves(req.decreaseIds(), req.increaseIds(), principal.getUsername());
    }
}
