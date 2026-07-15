package com.erp.controller;

import com.erp.dto.ItemGroupDtos.CreateItemGroupRequest;
import com.erp.dto.ItemGroupDtos.ItemGroupResponse;
import com.erp.dto.ItemGroupDtos.UpdateItemGroupRequest;
import com.erp.service.ItemGroupService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/item-groups")
@RequiredArgsConstructor
public class ItemGroupController {

    private final ItemGroupService itemGroupService;

    @GetMapping
    public List<ItemGroupResponse> list() {
        return itemGroupService.findAll();
    }

    @PostMapping
    public ResponseEntity<ItemGroupResponse> create(@Valid @RequestBody CreateItemGroupRequest req) {
        return ResponseEntity.ok(itemGroupService.create(req));
    }

    @PutMapping("/{id}")
    public ItemGroupResponse update(@PathVariable Long id, @Valid @RequestBody UpdateItemGroupRequest req) {
        return itemGroupService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        itemGroupService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
