package com.erp.accounting.controller;

import com.erp.accounting.dto.AccountingReflectionDtos.ReflectRequest;
import com.erp.accounting.dto.AccountingReflectionDtos.ReflectResult;
import com.erp.accounting.dto.AccountingReflectionDtos.SlipKind;
import com.erp.accounting.dto.AccountingReflectionDtos.SlipResponse;
import com.erp.accounting.service.AccountingReflectionService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.accounting.dto.AccountingReflectionDtos;

@RestController
@RequestMapping("/api/accounting-reflection")
@RequiredArgsConstructor
public class AccountingReflectionController {

    private final AccountingReflectionService service;

    /** 판매/구매 전표의 회계반영 현황 (onlyUnreflected=true 면 미반영만) */
    @GetMapping
    public List<SlipResponse> list(
            @RequestParam SlipKind kind,
            @RequestParam(defaultValue = "false") boolean onlyUnreflected) {
        return service.list(kind, onlyUnreflected);
    }

    /** 선택 전표 일괄 회계반영 (실제 분개 전표 생성) */
    @PostMapping("/reflect")
    public ResponseEntity<ReflectResult> reflect(@Valid @RequestBody ReflectRequest req) {
        return ResponseEntity.ok(service.reflect(req));
    }

    /** 선택 전표 회계반영 취소 (연결 분개 전표 삭제) */
    @PostMapping("/unreflect")
    public ResponseEntity<ReflectResult> unreflect(@Valid @RequestBody ReflectRequest req) {
        return ResponseEntity.ok(service.unreflect(req));
    }
}
