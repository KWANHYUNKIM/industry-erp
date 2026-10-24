package com.erp.trade.salesplan;

import com.erp.security.UserPrincipal;
import com.erp.trade.salesplan.dto.SalesPlanDtos.ComparisonRow;
import com.erp.trade.salesplan.dto.SalesPlanDtos.CreateSalesPlanRequest;
import com.erp.trade.salesplan.dto.SalesPlanDtos.SalesPlanResponse;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/sales-plans")
@RequiredArgsConstructor
public class SalesPlanController {

    private final SalesPlanService service;

    /** 매출계획 목록. year 지정 시 해당 연도만. */
    @GetMapping
    public List<SalesPlanResponse> list(@RequestParam(required = false) Integer year) {
        return service.findAll(year);
    }

    /**
     * 매출계획비교표: 계획 vs 실적(판매 집계) + 달성률.
     *
     * @param saleFlag 원본 [반품구분] — 전체 · 일반 · 반품. 안 주면 전체(반품까지 센다).
     */
    @GetMapping("/comparison")
    public List<ComparisonRow> comparison(@RequestParam int year,
                                          @RequestParam(required = false) String saleFlag) {
        return service.comparison(year, saleFlag);
    }

    /** 원본 매출계획비교표(E040626) — 기간 · 반품구분 · 표시조건1/2 · 조건 다섯. */
    @GetMapping("/compare")
    public List<com.erp.trade.salesplan.dto.SalesPlanDtos.CompareRow> compare(
            @RequestParam @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate from,
            @RequestParam @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate to,
            @RequestParam(required = false) String saleFlag,
            @RequestParam(required = false) String by1,
            @RequestParam(required = false) String by2,
            @RequestParam(required = false) Long itemId,
            @RequestParam(required = false) Long partnerId,
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(required = false) Long employeeId,
            @RequestParam(required = false) Long projectId) {
        return service.compare(from, to, saleFlag, by1, by2, itemId, partnerId, warehouseId, employeeId, projectId);
    }

    /** 원본 매출계획입력 — 여러 줄 전표 저장 · 수정 · 삭제(전표번호 단위). */
    @PostMapping("/docs")
    public List<SalesPlanResponse> createDoc(@Valid @RequestBody com.erp.trade.salesplan.dto.SalesPlanDtos.PlanDocRequest req,
                                             @org.springframework.security.core.annotation.AuthenticationPrincipal com.erp.security.UserPrincipal principal) {
        return service.createDoc(req, principal.getUsername());
    }

    @PutMapping("/docs/{planNo}")
    public List<SalesPlanResponse> updateDoc(@PathVariable String planNo,
                                             @Valid @RequestBody com.erp.trade.salesplan.dto.SalesPlanDtos.PlanDocRequest req,
                                             @org.springframework.security.core.annotation.AuthenticationPrincipal com.erp.security.UserPrincipal principal) {
        return service.updateDoc(planNo, req, principal.getUsername());
    }

    @DeleteMapping("/docs/{planNo}")
    public ResponseEntity<Void> deleteDoc(@PathVariable String planNo) {
        service.deleteDoc(planNo);
        return ResponseEntity.noContent().build();
    }

    @PostMapping
    public ResponseEntity<SalesPlanResponse> create(
            @Valid @RequestBody CreateSalesPlanRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(req, principal.getUsername()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
