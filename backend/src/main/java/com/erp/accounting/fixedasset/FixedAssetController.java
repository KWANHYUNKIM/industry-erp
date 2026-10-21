package com.erp.accounting.fixedasset;

import com.erp.accounting.fixedasset.dto.FixedAssetDtos.AssetResponse;
import com.erp.accounting.fixedasset.dto.FixedAssetDtos.CreateAssetRequest;
import com.erp.accounting.fixedasset.dto.FixedAssetDtos.DepreciateRequest;
import com.erp.accounting.fixedasset.dto.FixedAssetDtos.DepreciationResponse;
import com.erp.accounting.fixedasset.dto.FixedAssetDtos.DepreciationRunResponse;
import com.erp.accounting.fixedasset.dto.FixedAssetDtos.DisposeRequest;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.accounting.fixedasset.dto.FixedAssetDtos;

/** 회계 I > 고정자산 — 취득 등록 · 월별 감가상각 · 처분 */
@RestController
@RequestMapping("/api/fixed-assets")
@RequiredArgsConstructor
public class FixedAssetController {

    private final FixedAssetService service;

    @GetMapping
    public List<AssetResponse> list(
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
    public AssetResponse create(@Valid @RequestBody CreateAssetRequest req,
                                @AuthenticationPrincipal UserPrincipal principal) {
        return service.create(req, principal.getUsername());
    }

    /** 귀속월(yyyy-MM)의 감가상각을 사용중 자산 전체에 대해 실행 */
    @PostMapping("/depreciate")
    public DepreciationRunResponse depreciate(@Valid @RequestBody DepreciateRequest req,
                                              @AuthenticationPrincipal UserPrincipal principal) {
        return service.depreciate(req.period(), principal.getUsername());
    }

    @GetMapping("/depreciations")
    public List<DepreciationResponse> depreciations(@RequestParam(required = false) String period,
            /* 화면 조건 판의 [기간] — 안 주면 전 기간이다. */
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate from,
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate to) {
        return service.findDepreciations(period, from, to);
    }

    @PutMapping("/{id}")
    public AssetResponse update(@PathVariable Long id, @Valid @RequestBody FixedAssetDtos.UpdateAssetRequest req,
                                @AuthenticationPrincipal UserPrincipal principal) {
        return service.update(id, req, principal.getUsername());
    }

    @DeleteMapping("/{id}")
    public void delete(@PathVariable Long id) {
        service.delete(id);
    }

    /** 귀속월(yyyy-MM) 감가상각 취소 — 상각 행 · 분개를 지우고 누계액을 되돌린다(마지막 달부터). */
    @DeleteMapping("/depreciations")
    public DepreciationRunResponse cancelDepreciation(@RequestParam String period,
                                                      @RequestParam(required = false) Long assetId) {
        return service.cancelDepreciation(period, assetId);
    }

    /** 처분 취소 — 처분 분개를 지우고 사용중으로. */
    @DeleteMapping("/{id}/dispose")
    public AssetResponse cancelDisposal(@PathVariable Long id) {
        return service.cancelDisposal(id);
    }

    /** 고정자산증가 전표 더하기(같은 자산에 두 번째 증가). */
    @PostMapping("/{id}/increases")
    public AssetResponse addIncrease(@PathVariable Long id, @Valid @RequestBody FixedAssetDtos.IncreaseRequest req,
                                     @AuthenticationPrincipal UserPrincipal principal) {
        return service.addIncrease(id, req, principal.getUsername());
    }

    /** 고정자산감소 전표 — 일부 감소(수량). */
    @PostMapping("/{id}/decreases")
    public AssetResponse decrease(@PathVariable Long id, @Valid @RequestBody FixedAssetDtos.DecreaseRequest req,
                                  @AuthenticationPrincipal UserPrincipal principal) {
        return service.decrease(id, req, principal.getUsername());
    }

    /** 증가 · 감소 전표 한 장 지우기(그 회계전표도). 마지막 증가면 자산째 지워지고 빈 응답. */
    @DeleteMapping("/movements/{movementId}")
    public AssetResponse deleteMovement(@PathVariable Long movementId) {
        return service.deleteMovement(movementId);
    }

    @PostMapping("/{id}/dispose")
    public AssetResponse dispose(@PathVariable Long id, @Valid @RequestBody DisposeRequest req,
                                 @AuthenticationPrincipal UserPrincipal principal) {
        return service.dispose(id, req, principal.getUsername());
    }

    // ── 감가상각계산 묶음(원본 E010616) ────────────────────────────────────────

    private final DepreciationCalcService calcService;

    @GetMapping("/calcs")
    public List<FixedAssetDtos.CalcResponse> calcs() {
        return calcService.findAll();
    }

    @PostMapping("/calcs")
    public FixedAssetDtos.CalcResponse createCalc(@Valid @RequestBody FixedAssetDtos.CalcRequest req,
                                                  @AuthenticationPrincipal UserPrincipal principal) {
        return calcService.create(req, principal.getUsername());
    }

    /** [전체계산] · [고정자산대장에반영] */
    @PostMapping("/calcs/{id}/calculate")
    public FixedAssetDtos.CalcResponse calculate(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return calcService.calculate(id, principal.getUsername());
    }

    /** [반영내용삭제] */
    @DeleteMapping("/calcs/{id}/reflect")
    public FixedAssetDtos.CalcResponse unreflect(@PathVariable Long id) {
        return calcService.unreflect(id);
    }

    @DeleteMapping("/calcs/{id}")
    public void deleteCalc(@PathVariable Long id) {
        calcService.delete(id);
    }

    /** [조회] — 감가상각상세내역 */
    @GetMapping("/calcs/{id}/detail")
    public List<FixedAssetDtos.CalcDetailLine> calcDetail(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        return calcService.detail(id, principal.getUsername());
    }

    /** 기타 [전표생성] — 일반전표 초안 */
    @GetMapping("/calcs/{id}/slip")
    public FixedAssetDtos.SlipDraft calcSlip(@PathVariable Long id) {
        return calcService.slipDraft(id);
    }

    /** 기타 [이력] */
    @GetMapping("/calcs/{id}/history")
    public List<FixedAssetDtos.CalcHistoryRow> calcHistory(@PathVariable Long id) {
        return calcService.history(id);
    }
}
