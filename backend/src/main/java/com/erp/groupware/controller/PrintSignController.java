package com.erp.groupware.controller;

import com.erp.groupware.dto.PrintSignDtos.SignLineRequest;
import com.erp.groupware.dto.PrintSignDtos.SignLineResponse;
import com.erp.groupware.service.PrintSignService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.groupware.dto.PrintSignDtos;

/** 인쇄용 결재라인 — 출력물에 찍히는 담당/검토/승인 칸. */
@RestController
@RequestMapping("/api/print-sign-lines")
@RequiredArgsConstructor
public class PrintSignController {

    private final PrintSignService service;

    @GetMapping
    public List<SignLineResponse> list() {
        return service.findAll();
    }

    /** 목록 인쇄가 쓰는 기본 결재란 (없으면 본문 없음) */
    @GetMapping("/default")
    public ResponseEntity<SignLineResponse> defaultLine() {
        SignLineResponse d = service.findDefault();
        return d != null ? ResponseEntity.ok(d) : ResponseEntity.noContent().build();
    }

    @PostMapping
    public ResponseEntity<SignLineResponse> create(@Valid @RequestBody SignLineRequest req) {
        return ResponseEntity.ok(service.create(req));
    }

    @PutMapping("/{id}")
    public SignLineResponse update(@PathVariable Long id, @Valid @RequestBody SignLineRequest req) {
        return service.update(id, req);
    }

    @PostMapping("/{id}/default")
    public SignLineResponse setDefault(@PathVariable Long id) {
        return service.setDefault(id);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
