package com.erp.accounting.balanceadjust;

import com.erp.accounting.balanceadjust.dto.BalanceAdjustDtos.*;
import com.erp.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/** 회계 I › FastEntry › 잔액조정입력 · 잔액실사조회 · 잔액조정조회 · 잔액조정현황. 권한은 /api/journals(ACCOUNTING). */
@RestController
@RequestMapping("/api/journals/balance-adjustments")
@RequiredArgsConstructor
public class BalanceAdjustController {

    private final BalanceAdjustService service;

    /** 잔액조정입력 격자 — 기준일자 잔액. */
    @GetMapping("/accounts")
    public List<AccountBalanceRow> accounts(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf,
                                            @RequestParam(defaultValue = "0") long dept,
                                            @RequestParam(defaultValue = "0") long proj) {
        return service.accounts(asOf, dept, proj);
    }

    /** 잔액실사(계정별) 창. entryId 를 주면 그 잔액조정 전표의 실잔액 · 적요를 채워 연다([수정]). */
    @GetMapping("/audit")
    public AuditResponse audit(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate asOf,
                               @RequestParam Long accountId, @RequestParam(required = false) Long entryId) {
        return service.audit(asOf, accountId, entryId);
    }

    /** '거래처별집계구분' 창 [저장] — 계정의 ○없음 ◉거래처별 · ☑부서별집계 · ☑프로젝트별집계. */
    @PutMapping("/aggregation/{accountId}")
    public void setAggregation(@PathVariable Long accountId, @RequestBody AggregationRequest req) {
        service.setAggregation(accountId, req);
    }

    @PostMapping
    public AdjustmentRow save(@RequestBody SaveRequest req, @AuthenticationPrincipal UserPrincipal principal) {
        return service.save(req, principal.getUsername());
    }

    /** 잔액조정조회 · 잔액실사조회 */
    @GetMapping
    public List<AdjustmentRow> list(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                    @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.list(from, to);
    }

    /** 잔액조정현황 */
    @GetMapping("/status")
    public List<StatusRow> status(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                  @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.status(from, to);
    }

    /** [선택삭제] — '선택한 전표를 삭제 하겠습니까?' 뒤. */
    @PostMapping("/delete")
    public void delete(@RequestBody List<Long> entryIds) {
        service.delete(entryIds);
    }
}
