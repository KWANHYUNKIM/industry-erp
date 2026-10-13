package com.erp.hr.payroll;

import com.erp.accounting.yearend.TaxSettlementKind;
import com.erp.accounting.yearend.dto.TaxSettlementDtos.SettlementResponse;
import com.erp.hr.payroll.dto.YearEndDtos.Candidate;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 연말정산 · 중도정산의 hr 몫 — 대상자 후보 · [계산처리]. 주소는 accounting 의 TaxSettlementController 와 같은
 * /api/tax-settlements 아래지만 사원 · 확정 급여명세를 읽으므로 hr 에 둔다(hr → accounting 허용 간선, ProjectProfitController 와 같은 까닭).
 */
@RestController
@RequestMapping("/api/tax-settlements")
@RequiredArgsConstructor
public class YearEndPayController {

    private final YearEndPayService service;

    @GetMapping("/candidates")
    public List<Candidate> candidates(@RequestParam int year, @RequestParam(defaultValue = "YEAR_END") TaxSettlementKind kind,
                                      @RequestParam(defaultValue = "false") boolean includeRetired) {
        return service.candidates(year, kind, includeRetired);
    }

    /** 목록 [계산처리] · 정산공제항목 입력 [저장/계산처리(F8)] */
    @PostMapping("/calculate")
    public List<SettlementResponse> calculate(@RequestBody List<Long> ids) {
        return service.calculate(ids);
    }
}
