package com.erp.accounting.yearend;

import com.erp.accounting.yearend.dto.TaxSettlementDtos.DeductionRequest;
import com.erp.accounting.yearend.dto.TaxSettlementDtos.PrevEmployerRequest;
import com.erp.accounting.yearend.dto.TaxSettlementDtos.SettlementResponse;
import com.erp.accounting.yearend.dto.TaxSettlementDtos.TargetsRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * 연말정산등록/수정 (세무 › 원천징수 › 연말정산 E030109) · 중도정산등록/수정 (E030114) — 목록 · 대상자 넣기 · 공제 저장 · 삭제.
 *
 * <p>대상자 후보 목록 · [계산처리] 는 사원 · 급여명세를 읽어야 해서 hr 쪽 {@code hr.payroll.YearEndPayController} 가 같은 주소 아래에서 맡는다
 * (hr → accounting 은 허용, accounting → hr 은 부채 — ProjectProfitController 와 같은 까닭).
 */
@RestController
@RequestMapping("/api/tax-settlements")
@RequiredArgsConstructor
public class TaxSettlementController {

    private final TaxSettlementService service;

    @GetMapping
    public List<SettlementResponse> list(@RequestParam int year, @RequestParam(defaultValue = "YEAR_END") TaxSettlementKind kind) {
        return service.list(year, kind);
    }

    @GetMapping("/{id}")
    public SettlementResponse get(@PathVariable Long id) {
        return service.find(id);
    }

    /** 대상자추가 [적용(F8)] */
    @PostMapping("/targets")
    public List<SettlementResponse> addTargets(@RequestBody TargetsRequest req) {
        return service.addTargets(req.attributionYear(), req.kind() == null ? TaxSettlementKind.YEAR_END : req.kind(), req.employeeIds());
    }

    /** [선택삭제] */
    @PostMapping("/delete")
    public void delete(@RequestBody List<Long> ids) {
        service.delete(ids);
    }

    /** 종(전)근무지 및 납세조합 [저장(F8)] */
    @PutMapping("/{id}/prev-employers")
    public SettlementResponse savePrevEmployers(@PathVariable Long id, @RequestBody List<PrevEmployerRequest> rows) {
        return service.savePrevEmployers(id, rows);
    }

    /**
     * 보험료 세액공제 창(group=INSURANCE) · 의료비 창(group=MEDICAL) [저장(F8)].
     * 줄 목록을 그대로 받는 자리라 {@code List<@Valid …>} 는 메서드 검증 예외(전역 처리기 밖 → 500)가 된다 — 음수는 서비스가 같은 문구로 막는다.
     */
    @PutMapping("/{id}/deductions")
    public SettlementResponse saveDeductions(@PathVariable Long id, @RequestParam String group, @RequestBody List<DeductionRequest> rows) {
        List<TaxDeductionKind> kinds = "MEDICAL".equals(group)
                ? List.of(TaxDeductionKind.MEDICAL)
                : List.of(TaxDeductionKind.PROTECTION_INSURANCE, TaxDeductionKind.DISABLED_INSURANCE);
        return service.saveDeductions(id, kinds, rows);
    }
}
