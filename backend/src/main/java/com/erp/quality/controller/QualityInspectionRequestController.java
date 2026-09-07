package com.erp.quality.controller;

import com.erp.quality.domain.QualityRequestStatus;
import com.erp.quality.dto.QualityRequestDtos.CreateRequestReq;
import com.erp.quality.dto.QualityRequestDtos.RequestResponse;
import com.erp.quality.dto.QualityRequestDtos.UpdateStatusReq;
import com.erp.security.UserPrincipal;
import com.erp.quality.service.QualityInspectionRequestService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/quality-inspection-requests")
@RequiredArgsConstructor
public class QualityInspectionRequestController {

    private final QualityInspectionRequestService requestService;

    /** status 파라미터 생략 시 전체, 지정 시 해당 상태만(미검사현황 = REQUESTED). */
    @GetMapping
    public List<RequestResponse> list(@RequestParam(required = false) QualityRequestStatus status,
            /* 화면 조건 판의 [기간] — 안 주면 전 기간이다. */
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate from,
            @RequestParam(required = false)
            @org.springframework.format.annotation.DateTimeFormat(
                    iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE)
            java.time.LocalDate to) {
        return requestService.findAll(status, from, to);
    }

    @PostMapping
    public ResponseEntity<RequestResponse> create(
            @Valid @RequestBody CreateRequestReq req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(requestService.create(req, principal.getName()));
    }

    @PatchMapping("/{id}/status")
    public RequestResponse updateStatus(@PathVariable Long id, @Valid @RequestBody UpdateStatusReq req) {
        return requestService.updateStatus(id, req.status());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        requestService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
