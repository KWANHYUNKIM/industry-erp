package com.erp.accounting.fundplan;

import com.erp.accounting.fundplan.dto.FundPlanDtos.DeleteFundPlansRequest;
import com.erp.accounting.fundplan.dto.FundPlanDtos.FundPlanRequest;
import com.erp.accounting.fundplan.dto.FundPlanDtos.FundPlanResponse;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;

/** 회계 II &gt; 자금계획 — 계획전표. */
@RestController
@RequestMapping("/api/fund-plans")
@RequiredArgsConstructor
public class FundPlanController {

    private final FundPlanService service;

    @GetMapping
    public List<FundPlanResponse> list(@RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                       @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.find(from, to);
    }

    @GetMapping("/{id}")
    public FundPlanResponse get(@PathVariable Long id) {
        return service.get(id);
    }

    @PostMapping
    public FundPlanResponse create(@Valid @RequestBody FundPlanRequest req, @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, principal.getUsername());
    }

    @PutMapping("/{id}")
    public FundPlanResponse update(@PathVariable Long id, @Valid @RequestBody FundPlanRequest req,
                                   @AuthenticationPrincipal UserPrincipal principal) {
        return service.update(id, req, principal.getUsername());
    }

    /** [선택삭제] — '전표를 삭제하겠습니까?' 다음. */
    @PostMapping("/delete")
    public void delete(@Valid @RequestBody DeleteFundPlansRequest req) {
        service.delete(req.ids());
    }
}
