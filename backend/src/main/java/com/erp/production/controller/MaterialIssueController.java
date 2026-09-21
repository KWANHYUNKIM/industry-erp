package com.erp.production.controller;

import com.erp.production.dto.MaterialIssueDtos.CreateMaterialIssueBatchRequest;
import com.erp.production.dto.MaterialIssueDtos.CreateMaterialIssueRequest;
import com.erp.production.dto.MaterialIssueDtos.MaterialIssueResponse;
import com.erp.production.service.MaterialIssueService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import com.erp.production.dto.MaterialIssueDtos;

@RestController
@RequestMapping("/api/material-issues")
@RequiredArgsConstructor
public class MaterialIssueController {

    private final MaterialIssueService materialIssueService;

    /**
     * 목록. <b>from·to 는 불출일</b>, <b>woFrom·woTo 는 지시일</b>이다 —
     * 작업지시별로 묶어 세는 화면이 뒤를 쓴다. 함께 주면 거절한다(MaterialIssueService 참고).
     */
    @GetMapping
    public List<MaterialIssueResponse> list(
            @RequestParam(required = false) Long itemId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate woFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate woTo) {
        return materialIssueService.findAll(itemId, from, to, woFrom, woTo);
    }

    @PostMapping
    public ResponseEntity<MaterialIssueResponse> create(@Valid @RequestBody CreateMaterialIssueRequest req) {
        return ResponseEntity.ok(materialIssueService.create(req));
    }

    /** 원본 생산불출입력의 격자 — 한 전표에 자재 여러 줄. 한 줄이라도 막히면 전부 되돌린다. */
    @PostMapping("/batch")
    public ResponseEntity<List<MaterialIssueResponse>> createBatch(
            @Valid @RequestBody CreateMaterialIssueBatchRequest req) {
        return ResponseEntity.status(HttpStatus.CREATED).body(materialIssueService.createBatch(req));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        materialIssueService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
