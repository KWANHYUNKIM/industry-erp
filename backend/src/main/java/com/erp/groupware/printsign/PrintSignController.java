package com.erp.groupware.printsign;

import com.erp.groupware.printsign.dto.PrintSignDtos.LineResponse;
import com.erp.groupware.printsign.dto.PrintSignDtos.ModuleResponse;
import com.erp.groupware.printsign.dto.PrintSignDtos.SaveRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/** 인쇄용결재라인등록 — 모듈(ACCOUNTING · INVENTORY · MANAGEMENT)마다 결재라인 1 · 2. */
@RestController
@RequestMapping("/api/print-sign-lines")
@RequiredArgsConstructor
public class PrintSignController {

    private final PrintSignService service;

    @GetMapping
    public ModuleResponse get(@RequestParam(required = false) String module) {
        return service.find(PrintSignService.parseModule(module));
    }

    @PutMapping
    public ModuleResponse save(@RequestParam(required = false) String module, @Valid @RequestBody SaveRequest req) {
        return service.save(PrintSignService.parseModule(module), req);
    }

    /** 출력물이 찍는 결재라인 1(모듈을 안 주면 회계). 찍을 칸이 없으면 본문 없음. */
    @GetMapping("/default")
    public ResponseEntity<LineResponse> forPrint(@RequestParam(required = false) String module) {
        LineResponse line = service.findForPrint(PrintSignService.parseModule(module));
        return line != null ? ResponseEntity.ok(line) : ResponseEntity.noContent().build();
    }
}
