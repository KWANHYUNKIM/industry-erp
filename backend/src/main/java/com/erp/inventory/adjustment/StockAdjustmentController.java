package com.erp.inventory.adjustment;

import com.erp.inventory.adjustment.dto.StockAdjustmentDtos.AdjustmentResponse;
import com.erp.inventory.adjustment.dto.StockAdjustmentDtos.CreateAdjustmentRequest;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import com.erp.inventory.adjustment.dto.StockAdjustmentDtos;

/** 기타이동 — 자가사용·불량처리·재고조정 (창고이동은 /api/stock-transfers) */
@RestController
@RequestMapping("/api/stock-adjustments")
@RequiredArgsConstructor
public class StockAdjustmentController {

    private final StockAdjustmentService stockAdjustmentService;

    /**
     * 기타이동 목록. 화면이 고른 기간만 준다.
     *
     * <p><code>all=true</code> 는 원본 <b>[오천건이상조회]</b> — 잘린 뒤 눌러서 전부 가져온다.
     */
    @GetMapping
    public StockAdjustmentDtos.AdjustmentListResponse list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(defaultValue = "false") boolean all,
            /* 다섯 화면이 이 자리를 쓴다 — 유형을 주면 그 유형만 세고 문턱도 그 유형 것이 된다. */
            @RequestParam(required = false) com.erp.inventory.adjustment.StockAdjustmentType type) {
        return stockAdjustmentService.list(from, to, all, type);
    }

    @PostMapping
    public ResponseEntity<AdjustmentResponse> create(
            @Valid @RequestBody CreateAdjustmentRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(stockAdjustmentService.create(req, principal.getUsername()));
    }

    /** 삭제 — 바뀐 재고를 되돌린다. */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id, @AuthenticationPrincipal UserPrincipal principal) {
        stockAdjustmentService.delete(id, principal.getUsername());
        return ResponseEntity.noContent().build();
    }

    /** 원본 자가사용입력(E040503) — 품목 여러 줄을 전표 한 장으로. */
    @PostMapping("/slips")
    public StockAdjustmentDtos.SlipResponse createSlip(@Valid @RequestBody StockAdjustmentDtos.SlipRequest req,
                                                      @AuthenticationPrincipal UserPrincipal principal) {
        return stockAdjustmentService.createSlip(req, principal.getUsername());
    }

    @GetMapping("/slips/{adjustNo}")
    public StockAdjustmentDtos.SlipResponse getSlip(@PathVariable String adjustNo) {
        return stockAdjustmentService.getSlip(adjustNo);
    }

    /** 자가사용수정 — 일자는 그대로 두고 나머지를 새로 쓴다. */
    @PutMapping("/slips/{adjustNo}")
    public StockAdjustmentDtos.SlipResponse updateSlip(@PathVariable String adjustNo,
                                                      @Valid @RequestBody StockAdjustmentDtos.SlipRequest req,
                                                      @AuthenticationPrincipal UserPrincipal principal) {
        return stockAdjustmentService.updateSlip(adjustNo, req, principal.getUsername());
    }

    @DeleteMapping("/slips/{adjustNo}")
    public ResponseEntity<Void> deleteSlip(@PathVariable String adjustNo, @AuthenticationPrincipal UserPrincipal principal) {
        stockAdjustmentService.deleteSlip(adjustNo, principal.getUsername());
        return ResponseEntity.noContent().build();
    }
}
