package com.erp.inventory.managementitem;

import com.erp.inventory.managementitem.dto.ManagementItemDtos.CreateManagementItemRequest;
import com.erp.inventory.managementitem.dto.ManagementItemDtos.ManagementItemResponse;
import com.erp.inventory.managementitem.dto.ManagementItemDtos.UpdateManagementItemRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.inventory.managementitem.dto.ManagementItemDtos;

@RestController
@RequestMapping("/api/management-items")
@RequiredArgsConstructor
public class ManagementItemController {

    private final ManagementItemService managementItemService;

    @GetMapping
    public List<ManagementItemResponse> list() {
        return managementItemService.findAll();
    }

    @GetMapping("/unused")
    public List<Long> unused(@RequestParam @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate from,
                             @RequestParam @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate to) {
        return managementItemService.findUnusedIds(from, to);
    }

    @PostMapping
    public ResponseEntity<ManagementItemResponse> create(@Valid @RequestBody CreateManagementItemRequest req) {
        return ResponseEntity.ok(managementItemService.create(req));
    }

    @PutMapping("/{id}")
    public ManagementItemResponse update(@PathVariable Long id, @Valid @RequestBody UpdateManagementItemRequest req) {
        return managementItemService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        managementItemService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
