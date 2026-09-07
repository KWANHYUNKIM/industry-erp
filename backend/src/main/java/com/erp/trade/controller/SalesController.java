package com.erp.trade.controller;

import com.erp.trade.dto.SalesDtos.CreateSalesRequest;
import com.erp.trade.dto.SalesDtos.SalesDiscountRow;
import com.erp.trade.dto.SalesDtos.SalesResponse;
import com.erp.security.UserPrincipal;
import com.erp.trade.service.SalesService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import com.erp.trade.dto.SalesDtos;

@RestController
@RequestMapping("/api/sales")
@RequiredArgsConstructor
public class SalesController {

    private final SalesService salesService;

    /** 판매 목록. 기간을 주면 그만큼만 준다(안 주면 전 기간 — 예전 그대로다). */
    @GetMapping
    public List<SalesResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return salesService.findAll(from, to);
    }

    /**
     * 라인별 <b>기준단가 대비 실거래 할인</b>(기준단가·실단가·할인액·할인율).
     *
     * <p><b>주의 — 이 자리는 [판매할인현황] 화면의 뒤가 아니다.</b> 원본 판매할인현황의 표는
     * <b>월/일 · 거래처명 · 판매금액 · 회계반영금액 · 차액 · 적요</b>(사본 실측)로,
     * 여기서 재는 <b>단가 할인</b>과 다른 것이다. 그 화면은 전표를 그대로 읽어 그린다
     * (DiscountStatusPage). 이름이 비슷해 여기에 화면을 붙이면 <b>화면이 말하는 할인이
     * 통째로 바뀐다.</b>
     *
     * <p>지금 <b>어느 화면도 이 자리를 부르지 않는다.</b> 지우지 않는 것은 QA 가 기준단가
     * 처리(기준이 없으면 할인 0, 반올림·면세 섞임)를 여기서 재고 있어서다 —
     * 그 규칙은 단가를 다루는 다른 자리에도 그대로 걸린다.
     */
    @GetMapping("/discounts")
    public List<SalesDiscountRow> discounts(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return salesService.findDiscounts(from, to);
    }

    @PostMapping
    public ResponseEntity<SalesResponse> create(
            @Valid @RequestBody CreateSalesRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(salesService.create(req, principal.getUsername()));
    }

    /** 판매입력의 '수정'. 재고를 되돌린 뒤 새 내용으로 다시 반영한다. */
    @PutMapping("/{id}")
    public SalesResponse update(
            @PathVariable Long id,
            @Valid @RequestBody CreateSalesRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return salesService.update(id, req, principal.getUsername());
    }

    /** 판매조회의 '삭제'. 재고를 되돌린다. 회계반영·확인·세금계산서 발행 전표는 거부. */
    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(
            @PathVariable Long id,
            @AuthenticationPrincipal UserPrincipal principal) {
        salesService.delete(id, principal.getUsername());
        return ResponseEntity.noContent().build();
    }

    /** 판매조회의 '확인' */
    @PostMapping("/{id}/confirm")
    public SalesResponse confirm(@PathVariable Long id) {
        return salesService.confirm(id);
    }

    /** 판매조회의 '확인취소' */
    @PostMapping("/{id}/unconfirm")
    public SalesResponse unconfirm(@PathVariable Long id) {
        return salesService.unconfirm(id);
    }
}
