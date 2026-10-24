package com.erp.inventory.item;

import com.erp.inventory.item.dto.ItemGroupDtos.CreateItemGroupRequest;
import com.erp.inventory.item.dto.ItemGroupDtos.ItemGroupResponse;
import com.erp.inventory.item.dto.ItemGroupDtos.UpdateItemGroupRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.inventory.item.dto.ItemGroupDtos;

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
