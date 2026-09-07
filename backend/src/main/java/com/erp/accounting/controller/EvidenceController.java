package com.erp.accounting.controller;

import com.erp.accounting.domain.enums.EvidenceMethod;
import com.erp.accounting.dto.EvidenceDtos.EvidenceResponse;
import com.erp.accounting.service.EvidenceService;
import com.erp.security.UserPrincipal;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.time.LocalDate;
import java.util.List;

/** 증빙센터 — 전표에 붙은 증빙(첨부파일)의 등록·조회·삭제. */
@RestController
@RequestMapping("/api/evidence-attachments")
@RequiredArgsConstructor
public class EvidenceController {

    private final EvidenceService service;

    /** entityType+entityId 를 주면 그 전표의 증빙만, 아니면 기간·조건 검색. */
    @GetMapping
    public List<EvidenceResponse> list(
            @RequestParam(required = false) String entityType,
            @RequestParam(required = false) Long entityId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate evidenceFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate evidenceTo,
            @RequestParam(required = false) String worker,
            @RequestParam(required = false) EvidenceMethod method,
            @RequestParam(required = false) Boolean attached) {
        if (entityId != null) {
            return service.byTarget(entityType, entityId);
        }
        return service.search(from, to, evidenceFrom, evidenceTo, entityType, worker, method, attached);
    }

    @GetMapping("/workers")
    public List<String> workers() {
        return service.workers();
    }

    /** 증빙 등록(multipart). file 은 선택 — 증빙방법만 기록해 둘 수도 있다. */
    @PostMapping
    public ResponseEntity<EvidenceResponse> create(
            @RequestParam String entityType,
            @RequestParam Long entityId,
            @RequestParam(required = false) String docNo,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate docDate,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate evidenceDate,
            @RequestParam(required = false) EvidenceMethod method,
            @RequestParam(required = false) String note,
            @RequestPart(value = "file", required = false) MultipartFile file,
            @AuthenticationPrincipal UserPrincipal principal) {
        return ResponseEntity.ok(service.create(entityType, entityId, docNo, docDate, evidenceDate,
                method, note, file, principal.getUsername()));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
