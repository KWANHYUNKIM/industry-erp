package com.erp.quality.asrequest;

import com.erp.quality.asrequest.dto.AsDtos.AsResponse;
import com.erp.quality.asrequest.dto.AsDtos.CreateAsRequest;
import com.erp.quality.asrequest.dto.AsDtos.UpdateAsRequest;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import com.erp.quality.asrequest.dto.AsDtos;

@RestController
@RequestMapping("/api/as-requests")
@RequiredArgsConstructor
public class AsController {

    private final AsService asService;

    /** 목록. 기간을 주면 그만큼만 준다(안 주면 전 기간 — 예전 그대로다). */
    @GetMapping
    public List<AsResponse> list(
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            /* 원본 A/S수리현황(E040611)의 주 조건 [기준일자] — 수리한 날이다. */
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate doneFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate doneTo) {
        return asService.findAll(from, to, doneFrom, doneTo);
    }

    @PostMapping
    public ResponseEntity<AsResponse> create(
            @Valid @RequestBody CreateAsRequest req,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(asService.create(req, principal.getUsername()));
    }

    @PatchMapping("/{id}")
    public AsResponse update(@PathVariable Long id, @RequestBody UpdateAsRequest req) {
        return asService.update(id, req);
    }

    // 소모부품 -------------------------------------------------------------

    /** 원본 A/S접수조회 [선택삭제] · 수정 창 [삭제]. */
    @DeleteMapping("/{id}")
    public org.springframework.http.ResponseEntity<Void> delete(@PathVariable Long id) {
        asService.delete(id);
        return org.springframework.http.ResponseEntity.noContent().build();
    }
}
