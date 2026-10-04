package com.erp.accounting.otherwithholding;

import com.erp.accounting.otherwithholding.dto.OtherWithholdingDtos.CreateWithholdingRequest;
import com.erp.accounting.otherwithholding.dto.OtherWithholdingDtos.MonthlySummary;
import com.erp.accounting.otherwithholding.dto.OtherWithholdingDtos.OtherWithholdingResponse;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import com.erp.accounting.otherwithholding.dto.OtherWithholdingDtos;

/** 기타원천세 (세무 > 기타원천세) — 사업·기타·이자·배당소득 지급 시 원천징수 */
@RestController
@RequestMapping("/api/other-withholdings")
@RequiredArgsConstructor
public class OtherWithholdingController {

    private final OtherWithholdingService service;

    /** 월별 기타원천세 (month=2026-07, 생략하면 이번 달) */
    @GetMapping
    public MonthlySummary month(@RequestParam(required = false) String month) {
        return service.findMonth(month);
    }

    @PostMapping
    public ResponseEntity<OtherWithholdingResponse> create(@Valid @RequestBody CreateWithholdingRequest req,
                                                           @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(req, principal.getUsername()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }

    // ── 원본 기타원천세입력 · 조회 · 현황(E030314 · E030315 · E030316) ──────────────────

    /** 기타원천세조회 — 전표마다(from ~ to 지급일자). */
    @GetMapping("/slips")
    public java.util.List<OtherWithholdingDtos.SlipListRow> slips(
            @RequestParam @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate from,
            @RequestParam @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate to) {
        return service.listSlips(from, to);
    }

    /** 기타원천세현황 — 지급 줄마다. */
    @GetMapping("/lines")
    public java.util.List<OtherWithholdingDtos.LineReportRow> lines(
            @RequestParam @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate from,
            @RequestParam @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate to) {
        return service.lineReport(from, to);
    }

    @GetMapping("/slips/{payDate}/{slipSeq}")
    public OtherWithholdingDtos.SlipResponse slip(
            @PathVariable @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate payDate,
            @PathVariable int slipSeq) {
        return service.getSlip(payDate, slipSeq);
    }

    @PostMapping("/slips")
    public OtherWithholdingDtos.SlipResponse createSlip(@Valid @RequestBody OtherWithholdingDtos.SlipRequest req,
                                                        @AuthenticationPrincipal UserPrincipal principal) {
        return service.createSlip(req, principal.getUsername());
    }

    @PutMapping("/slips/{payDate}/{slipSeq}")
    public OtherWithholdingDtos.SlipResponse updateSlip(
            @PathVariable @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate payDate,
            @PathVariable int slipSeq, @Valid @RequestBody OtherWithholdingDtos.SlipRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return service.updateSlip(payDate, slipSeq, req, principal.getUsername());
    }

    /** [선택삭제] */
    @PostMapping("/slips/delete")
    public ResponseEntity<Void> deleteSlips(@RequestBody java.util.List<OtherWithholdingDtos.SlipKey> keys) {
        service.deleteSlips(keys);
        return ResponseEntity.noContent().build();
    }

    /** 원천징수영수증(보관용) — kind: BUSINESS · INTEREST(이자배당) · OTHER, 귀속연월 from ~ to(YYYY-MM). */
    @GetMapping("/receipts")
    public java.util.List<OtherWithholdingDtos.ReceiptPayee> receipts(@RequestParam String kind, @RequestParam String from,
                                                                      @RequestParam String to) {
        return service.receipts(kind, from, to);
    }
}
