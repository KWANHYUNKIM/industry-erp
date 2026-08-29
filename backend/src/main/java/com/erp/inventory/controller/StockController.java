package com.erp.inventory.controller;

import com.erp.common.ApiException;
import com.erp.inventory.dto.StockDtos.StockResponse;
import com.erp.inventory.dto.StockDtos.StockTransactionRequest;
import com.erp.inventory.dto.StockDtos.StockTransactionResponse;
import com.erp.security.UserPrincipal;
import com.erp.inventory.service.StockService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import com.erp.inventory.dto.StockDtos;

@RestController
@RequestMapping("/api/stock")
@RequiredArgsConstructor
public class StockController {

    private final StockService stockService;

    /** 현재고 목록 */
    /**
     * 재고 목록. <b>asOf 를 주면 그 시점 재고</b>다(재고현황·창고별재고·일별재고·BOM재고의
     * [기준일자]). 안 주면 현재고 — 예전 동작 그대로다.
     */
    @GetMapping
    public List<StockResponse> current(
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate asOf) {
        return asOf != null ? stockService.stockAsOf(asOf) : stockService.currentStock();
    }

    /**
     * 입출고 이력.
     *
     * <p><b>쪽 번호·크기를 여기서 막는다.</b> 예전에는 그대로 넘겨서 두 가지가 났다.
     * <ul>
     *   <li>{@code page=-1}·{@code size=0} 이 <b>500</b> 으로 터지고 스프링의 영문 문구
     *       ("Page index must not be less than zero")가 화면까지 새어 나왔다.
     *       값이 잘못된 것이므로 400 이고, 무엇을 고쳐야 하는지 한글로 말해야 한다.</li>
     *   <li>{@code size=999999} 를 주면 <b>11만 9천 줄</b>을 한 번에 만들어 내려보냈다(1.8초).
     *       누구든 주소만 고쳐 쓰면 표 전체를 통째로 뽑을 수 있고, 그동안 서버는 그 자료를
     *       모두 메모리에 든다. 화면이 실제로 쓰는 크기는 50이라 1000이면 넉넉하다.</li>
     * </ul>
     */
    @GetMapping("/transactions")
    public Page<StockTransactionResponse> transactions(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "50") int size) {
        if (page < 0) {
            throw ApiException.badRequest("쪽 번호는 0 이상이어야 합니다.");
        }
        if (size < 1 || size > MAX_PAGE_SIZE) {
            throw ApiException.badRequest("한 쪽에 담을 줄 수는 1~" + MAX_PAGE_SIZE + " 입니다.");
        }
        return stockService.transactions(page, size);
    }

    /** 한 번에 내려보낼 수 있는 줄 수의 한계. */
    private static final int MAX_PAGE_SIZE = 1000;

    /** 재고수불부 — 기간·창고·품목으로 거른 입출고 원장(일자순) + 기초재고. 파라미터 생략 시 미필터. */
    @GetMapping("/ledger")
    public StockDtos.StockLedgerResponse ledger(
            @RequestParam(required = false) Long itemId,
            @RequestParam(required = false) Long warehouseId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return stockService.ledger(itemId, warehouseId, from, to);
    }

    /** 재고변동표 — 품목별 기초·입고·출고·기말. warehouseId 생략 시 전 창고 합산. */
    @GetMapping("/movement")
    public List<StockDtos.StockMovementRow> movement(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) Long warehouseId) {
        return stockService.movement(from, to, warehouseId);
    }

    /** 잔량재집계 — 점검만(값을 고치지 않는다). 월은 yyyy-MM. */
    @GetMapping("/recalc")
    public StockDtos.StockRecalcResult recalcPreview(
            @RequestParam(required = false) String fromMonth,
            @RequestParam(required = false) String toMonth) {
        return stockService.recalculate(startOf(fromMonth), endOf(toMonth), false);
    }

    /** 잔량재집계 실행 — 어긋난 거래잔량·현재고를 수불 이력 기준으로 맞춘다. */
    @PostMapping("/recalc")
    public StockDtos.StockRecalcResult recalcApply(
            @RequestParam(required = false) String fromMonth,
            @RequestParam(required = false) String toMonth) {
        return stockService.recalculate(startOf(fromMonth), endOf(toMonth), true);
    }

    /** yyyy-MM → 그 달 1일. 생략 시 아주 과거(전 기간). */
    private LocalDate startOf(String month) {
        return month == null || month.isBlank()
                ? LocalDate.of(1900, 1, 1)
                : java.time.YearMonth.parse(month).atDay(1);
    }

    /** yyyy-MM → 그 달 말일. 생략 시 아주 미래(전 기간). */
    private LocalDate endOf(String month) {
        return month == null || month.isBlank()
                ? LocalDate.of(2999, 12, 31)
                : java.time.YearMonth.parse(month).atEndOfMonth();
    }

    /** 입고/출고/조정 등록 */
    @PostMapping("/transactions")
    public ResponseEntity<StockTransactionResponse> record(
            @Valid @RequestBody StockTransactionRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(stockService.record(req, principal.getUsername()));
    }
}
