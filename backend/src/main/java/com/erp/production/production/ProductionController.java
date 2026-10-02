package com.erp.production.production;

import com.erp.production.production.dto.ProductionDtos.CreateProductionBatchRequest;
import com.erp.production.production.dto.ProductionDtos.CreateProductionRequest;
import com.erp.production.production.dto.ProductionDtos.ProductionMaterialResponse;
import com.erp.production.production.dto.ProductionDtos.ProductionResponse;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import com.erp.production.production.dto.ProductionDtos;

@RestController
@RequestMapping("/api/productions")
@RequiredArgsConstructor
public class ProductionController {

    private final ProductionService productionService;

    /** 목록. 기간을 주면 그만큼만 준다(안 주면 전 기간 — 예전 그대로다). */
    /**
     * 목록. <b>from·to 는 생산일</b>, <b>woFrom·woTo 는 지시일</b>이다 —
     * 작업지시별로 묶어 세는 화면이 뒤를 쓴다. 함께 주면 거절한다(ProductionService 참고).
     */
    @GetMapping
    public List<ProductionResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate woFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate woTo) {
        return productionService.findAll(from, to, woFrom, woTo);
    }

    /** 제품의 BOM 소요량(미저장). 원본 생산입고 II·III [소모] 탭의 [BOM풀기]. */
    @GetMapping("/bom-preview")
    public List<ProductionMaterialResponse> bomPreview(@RequestParam Long productId, @RequestParam BigDecimal qty,
                                                       @RequestParam(defaultValue = "ONE") String level,
                                                       @RequestParam(required = false) Long bomId) {
        // 원본 BOM풀기 갈래 — ONE(1단계, 기본) · ALL(전체: 반제품을 끝까지 푼다). bomId 는 줄의 [BOM버전](없으면 기본).
        return productionService.bomPreview(productId, qty, "ALL".equalsIgnoreCase(level), bomId);
    }

    /** 전표 하나(같은 번호의 줄들). 원본 생산입고조회에서 번호를 눌러 여는 것. */
    @GetMapping("/slips/{prodNo}")
    public List<ProductionResponse> slip(@PathVariable String prodNo) {
        return productionService.findSlip(prodNo);
    }

    /** 원본 생산입고 I·II·III 의 [저장] — 줄이 몇 개든 번호 하나. */
    @PostMapping("/slips")
    public ResponseEntity<List<ProductionResponse>> createSlip(
            @Valid @RequestBody ProductionDtos.SaveProductionSlipRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(productionService.createSlip(req, principal.getUsername()));
    }

    /** 연 전표를 고쳐 [저장]. 옛 줄을 되돌리고 새 줄로 넣는다. */
    @PutMapping("/slips/{prodNo}")
    public List<ProductionResponse> updateSlip(
            @PathVariable String prodNo,
            @Valid @RequestBody ProductionDtos.SaveProductionSlipRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return productionService.updateSlip(prodNo, req, principal.getUsername());
    }

    /** 원본 [진행상태변경] — 고른 전표들을 미확인 ↔ 확인. 바꾼 전표 수를 준다. */
    @PostMapping("/slips/status")
    public java.util.Map<String, Integer> changeStatus(@Valid @RequestBody ProductionDtos.ChangeStatusRequest req) {
        return java.util.Map.of("changed", productionService.changeStatus(req.prodNos(), req.status()));
    }

    /** 전표째 [삭제]. */
    @DeleteMapping("/slips/{prodNo}")
    public ResponseEntity<Void> deleteSlip(@PathVariable String prodNo, java.security.Principal principal) {
        productionService.deleteSlip(prodNo, principal != null ? principal.getName() : null);
        return ResponseEntity.noContent().build();
    }

    /** 생산실적 삭제. 재고와 작업지시 진척을 함께 되돌린다. */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, java.security.Principal principal) {
        productionService.delete(id, principal != null ? principal.getName() : null);
        return ResponseEntity.noContent().build();
    }

    /** 원본 생산입고 II·III 의 격자 — 한 번에 여러 줄. 한 줄이라도 막히면 전부 되돌린다. */
    @PostMapping("/batch")
    public ResponseEntity<java.util.List<ProductionResponse>> createBatch(
            @Valid @RequestBody CreateProductionBatchRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(productionService.createBatch(req, principal.getUsername()));
    }

    @PostMapping
    public ResponseEntity<ProductionResponse> create(
            @Valid @RequestBody CreateProductionRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(productionService.create(req, principal.getUsername()));
    }
}
