package com.erp.groupware.controller;

import com.erp.groupware.dto.SpamRuleDtos.SaveSpamRuleRequest;
import com.erp.groupware.dto.SpamRuleDtos.SpamRuleResponse;
import com.erp.groupware.service.SpamRuleService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 스팸 분류 규칙 — 공용메일 수신 등록 시 이 규칙으로 스팸함에 가른다. */
@RestController
@RequestMapping("/api/spam-rules")
@RequiredArgsConstructor
public class SpamRuleController {

    private final SpamRuleService service;

    @GetMapping
    public List<SpamRuleResponse> list() {
        return service.findAll();
    }

    @PostMapping
    public ResponseEntity<SpamRuleResponse> create(@Valid @RequestBody SaveSpamRuleRequest req) {
        return ResponseEntity.ok(service.create(req));
    }

    @PutMapping("/{id}")
    public SpamRuleResponse update(@PathVariable Long id, @Valid @RequestBody SaveSpamRuleRequest req) {
        return service.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        service.delete(id);
        return ResponseEntity.noContent().build();
    }
}
