package com.erp.accounting.withholding;

import com.erp.accounting.withholding.dto.WithholdingDtos.WithholdingReceipt;
import com.erp.accounting.withholding.dto.WithholdingDtos.WithholdingStatement;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import com.erp.accounting.withholding.dto.WithholdingDtos.WithholdingReturnRequest;
import com.erp.accounting.withholding.dto.WithholdingDtos.WithholdingReturnResponse;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.accounting.withholding.dto.WithholdingDtos;

@RestController
@RequestMapping("/api/withholding")
@RequiredArgsConstructor
public class WithholdingController {

    private final WithholdingService service;
    private final WithholdingReturnService returnService;
    private final IncomeSubmissionService incomeSubmissionService;

    /** 원천징수이행상황신고서 목록 (E030101) */
    @GetMapping("/returns")
    public List<WithholdingReturnResponse> returns() {
        return returnService.list();
    }

    @PostMapping("/returns")
    public WithholdingReturnResponse createReturn(@Valid @RequestBody WithholdingReturnRequest req) {
        return returnService.create(req);
    }

    @PutMapping("/returns/{id}")
    public WithholdingReturnResponse updateReturn(@PathVariable Long id, @Valid @RequestBody WithholdingReturnRequest req) {
        return returnService.update(id, req);
    }

    /** 선택삭제 */
    @PostMapping("/returns/delete")
    public void deleteReturns(@RequestBody List<Long> ids) {
        returnService.delete(ids);
    }


    /** 원천징수이행상황신고서 (귀속월) */
    /**
     * 원천징수영수증(일용직) (C000733) — 지급연월의 출역을 사원마다 [사원번호 · 사원명 · 총지급액 · 비과세총액 · 소득세 · 지방소득세].
     * 원본 목록 열 그대로(주민등록번호는 두지 않는다).
     */
    @GetMapping("/daily-receipts")
    public List<WithholdingDtos.DailyReceipt> dailyReceipts(@RequestParam String month) {
        return service.dailyReceipts(month);
    }

    /** 원천세신고자료비교표 (E030104) — 기준연도 달마다 구분별 자료 vs 신고내역, 끝에 합계. */
    @GetMapping("/comparison")
    public List<WithholdingDtos.ComparisonRow> comparison(@RequestParam int year) {
        return service.comparison(year);
    }

    /** 소득자료제출집계표 (E030508) — kind 는 원본 [출력구분] 이름(사업소득 · 기타소득 …), 귀속연월 from ~ to. */
    @GetMapping("/income-submission")
    public WithholdingDtos.IncomeSubmission incomeSubmission(@RequestParam String kind, @RequestParam String from,
                                                            @RequestParam String to) {
        return incomeSubmissionService.summary(kind, from, to);
    }

    @GetMapping("/statement")
    public WithholdingStatement statement(@RequestParam String month) {
        return service.statement(month);
    }

    /** 원천징수부 (기준연월까지, 사원별 달별 지급명세) */
    @GetMapping("/ledger")
    public List<WithholdingDtos.LedgerEmployee> ledger(@RequestParam String month,
                                                       @RequestParam(required = false) String from) {
        return from == null ? service.ledger(month) : service.ledger(from, month);
    }

    /** 근로소득 원천징수영수증 (연간, 사원별) */
    @GetMapping("/receipts")
    public List<WithholdingReceipt> receipts(@RequestParam int year) {
        return service.receipts(year);
    }
}
