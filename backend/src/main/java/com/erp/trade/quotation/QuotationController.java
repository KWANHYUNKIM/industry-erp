package com.erp.trade.quotation;

import com.erp.trade.quotation.dto.QuotationDtos.CreateQuotationRequest;
import com.erp.trade.quotation.dto.QuotationDtos.QuotationResponse;
import com.erp.trade.salesorder.dto.SalesOrderDtos.SalesOrderResponse;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import com.erp.trade.quotation.dto.QuotationDtos;
import com.erp.trade.salesorder.dto.SalesOrderDtos;

@RestController
@RequestMapping("/api/quotations")
@RequiredArgsConstructor
public class QuotationController {

    private final QuotationService service;

    /** 목록. 기간을 주면 그만큼만 준다(안 주면 전 기간 — 예전 그대로다). */
    @GetMapping
    public List<QuotationResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        return service.findAll(from, to);
    }

    @PostMapping
    public ResponseEntity<QuotationResponse> create(
            @Valid @RequestBody CreateQuotationRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(req, principal.getUsername()));
    }

    /** 견적서수정 — [일자-No.] 로 연 창의 [저장(F8)]. */
    @PutMapping("/{id}")
    public QuotationResponse update(@PathVariable Long id, @Valid @RequestBody CreateQuotationRequest req) {
        return service.update(id, req);
    }

    /** [Fn] → [일자변경]. 본문 {"date":"yyyy-MM-dd"}. */
    @PostMapping("/{id}/change-date")
    public QuotationResponse changeDate(@PathVariable Long id, @RequestBody java.util.Map<String, String> body) {
        String d = body.get("date");
        if (d == null || d.isBlank()) throw com.erp.common.ApiException.badRequest("변경일자를 입력하세요.");
        return service.changeDate(id, java.time.LocalDate.parse(d));
    }

    /** 하단 [진행상태변경] — 미확인 · 진행중 · 완료. */
    @PatchMapping("/{id}/status")
    public QuotationResponse updateStatus(@PathVariable Long id,
                                          @RequestBody QuotationDtos.UpdateQuotationStatusRequest req) {
        return service.updateStatus(id, req.status());
    }

    /** 줄의 [생성한전표] '조회' — 이 견적에서 만든 주문서. */
    @GetMapping("/{id}/generated")
    public List<QuotationDtos.GeneratedSlipRow> generated(@PathVariable Long id) {
        return service.generatedSlips(id);
    }

    @PostMapping("/{id}/cancel")
    public QuotationResponse cancel(@PathVariable Long id) {
        return service.cancel(id);
    }

    /** 원본 [다른전표생성] › 주문서 › 1장라인별 — 채운 주문서입력 창의 [저장(F8)]. 만든 주문서를 고른 견적들에 잇는다. */
    @PostMapping("/convert")
    public ResponseEntity<SalesOrderResponse> convertMany(
            @Valid @RequestBody QuotationDtos.ConvertToOrderRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.convertToOrder(req.quotationIds(), req.order(), principal.getUsername()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
