package com.erp.settings.controller;

import com.erp.settings.dto.CustomFieldDtos.CreateFieldDefRequest;
import com.erp.settings.dto.CustomFieldDtos.EntityCustomFields;
import com.erp.settings.dto.CustomFieldDtos.FieldDefResponse;
import com.erp.settings.dto.CustomFieldDtos.SaveValuesRequest;
import com.erp.settings.dto.CustomFieldDtos.UpdateFieldDefRequest;
import com.erp.settings.service.CustomFieldService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** 사용자정의 필드(Self-Customizing) — 정의 CRUD + 전표별 값 저장/조회. */
@RestController
@RequestMapping("/api/custom-fields")
@RequiredArgsConstructor
public class CustomFieldController {

    private final CustomFieldService service;

    // 정의
    @GetMapping("/defs")
    public List<FieldDefResponse> defs(@RequestParam String entityType) {
        return service.findDefs(entityType);
    }

    @PostMapping("/defs")
    public ResponseEntity<FieldDefResponse> createDef(@Valid @RequestBody CreateFieldDefRequest req) {
        return ResponseEntity.ok(service.createDef(req));
    }

    @PutMapping("/defs/{id}")
    public FieldDefResponse updateDef(@PathVariable Long id, @Valid @RequestBody UpdateFieldDefRequest req) {
        return service.updateDef(id, req);
    }

    @DeleteMapping("/defs/{id}")
    public ResponseEntity<Void> deleteDef(@PathVariable Long id) {
        service.deleteDef(id);
        return ResponseEntity.noContent().build();
    }

    // 값 (특정 전표)
    @GetMapping("/values")
    public EntityCustomFields values(@RequestParam String entityType, @RequestParam Long entityId) {
        return service.getForEntity(entityType, entityId);
    }

    @PutMapping("/values")
    public EntityCustomFields saveValues(@RequestParam String entityType, @RequestParam Long entityId,
                                         @Valid @RequestBody SaveValuesRequest req) {
        return service.saveValues(entityType, entityId, req);
    }
}
