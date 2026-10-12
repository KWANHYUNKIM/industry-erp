package com.erp.quality.qctype;

import com.erp.quality.qctype.dto.QcTypeDtos.*;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/** 품질검사유형등록(E040632) — 검사유형 · 검사항목설정 · 품목설정 · 품목별설정리스트 · 검사항목 · 상세항목. */
@RestController
@RequestMapping("/api")
@RequiredArgsConstructor
public class QcTypeController {

    private final QcTypeService service;

    @GetMapping("/quality-types")
    public List<TypeResponse> types() {
        return service.findTypes();
    }

    @PostMapping("/quality-types")
    public TypeResponse createType(@Valid @RequestBody CreateTypeRequest req) {
        return service.createType(req);
    }

    @PutMapping("/quality-types/{id}")
    public TypeResponse updateType(@PathVariable Long id, @Valid @RequestBody UpdateTypeRequest req) {
        return service.updateType(id, req);
    }

    @PostMapping("/quality-types/bulk")
    public ResponseEntity<Void> bulkTypes(@Valid @RequestBody BulkRequest req) {
        service.bulkTypes(req);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/quality-types/{id}/slots")
    public List<SlotResponse> slots(@PathVariable Long id) {
        return service.findSlots(id);
    }

    @PutMapping("/quality-types/{id}/slots")
    public List<SlotResponse> saveSlots(@PathVariable Long id, @Valid @RequestBody SaveSlotsRequest req) {
        return service.saveSlots(id, req);
    }

    @GetMapping("/quality-types/{id}/items")
    public List<TypeItemResponse> typeItems(@PathVariable Long id) {
        return service.findTypeItems(id);
    }

    @PostMapping("/quality-types/{id}/items")
    public List<TypeItemResponse> addTypeItems(@PathVariable Long id, @Valid @RequestBody ItemIdsRequest req) {
        return service.addTypeItems(id, req);
    }

    @PostMapping("/quality-types/{id}/items/remove")
    public List<TypeItemResponse> removeTypeItems(@PathVariable Long id, @Valid @RequestBody ItemIdsRequest req) {
        return service.removeTypeItems(id, req);
    }

    @GetMapping("/quality-types/item-settings")
    public List<ItemSettingResponse> itemSettings() {
        return service.findItemSettings();
    }

    @GetMapping("/quality-check-items")
    public List<CheckItemResponse> checkItems() {
        return service.findCheckItems();
    }

    @GetMapping("/quality-check-items/next-code")
    public Map<String, String> nextCheckItemCode() {
        return Map.of("code", service.nextCheckItemCode());
    }

    @PostMapping("/quality-check-items")
    public CheckItemResponse createCheckItem(@Valid @RequestBody SaveCheckItemRequest req) {
        return service.createCheckItem(req);
    }

    @PutMapping("/quality-check-items/{id}")
    public CheckItemResponse updateCheckItem(@PathVariable Long id, @Valid @RequestBody SaveCheckItemRequest req) {
        return service.updateCheckItem(id, req);
    }

    @PostMapping("/quality-check-items/bulk")
    public ResponseEntity<Void> bulkCheckItems(@Valid @RequestBody BulkRequest req) {
        service.bulkCheckItems(req);
        return ResponseEntity.noContent().build();
    }

    @GetMapping("/quality-check-items/{id}/details")
    public List<DetailResponse> details(@PathVariable Long id) {
        return service.findDetails(id);
    }

    @GetMapping("/quality-check-items/{id}/details/next-code")
    public Map<String, String> nextDetailCode(@PathVariable Long id) {
        return Map.of("code", service.nextDetailCode(id));
    }

    @PostMapping("/quality-check-items/{id}/details")
    public DetailResponse createDetail(@PathVariable Long id, @Valid @RequestBody SaveDetailRequest req) {
        return service.createDetail(id, req);
    }

    @PutMapping("/quality-check-item-details/{id}")
    public DetailResponse updateDetail(@PathVariable Long id, @Valid @RequestBody SaveDetailRequest req) {
        return service.updateDetail(id, req);
    }

    @PostMapping("/quality-check-item-details/bulk")
    public ResponseEntity<Void> bulkDetails(@Valid @RequestBody BulkRequest req) {
        service.bulkDetails(req);
        return ResponseEntity.noContent().build();
    }
}
