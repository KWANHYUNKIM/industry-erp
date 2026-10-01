package com.erp.inventory.item;

import com.erp.inventory.item.dto.ItemDtos.CreateItemRequest;
import com.erp.inventory.item.dto.ItemDtos.ItemResponse;
import com.erp.inventory.item.dto.ItemDtos.UpdateItemRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import com.erp.inventory.item.dto.ItemDtos;

@RestController
@RequestMapping("/api/items")
@RequiredArgsConstructor
public class ItemController {

    private final ItemService itemService;

    @GetMapping
    public List<ItemResponse> list() {
        return itemService.findAll();
    }

    /** 품목명·규격 자동완성 — 로그인한 회사의 품목에서만 찾는다. */
    @GetMapping("/suggest")
    public List<String> suggest(@RequestParam String field,
                                @RequestParam(defaultValue = "") String q,
                                @RequestParam(defaultValue = "10") int limit) {
        return itemService.suggest(field, q, limit);
    }

    @GetMapping("/{id}")
    public ItemResponse get(@PathVariable Long id) {
        return itemService.findById(id);
    }

    @PostMapping
    public ResponseEntity<ItemResponse> create(@Valid @RequestBody CreateItemRequest req) {
        return ResponseEntity.ok(itemService.create(req));
    }

    @PutMapping("/{id}")
    public ItemResponse update(@PathVariable Long id, @Valid @RequestBody UpdateItemRequest req) {
        return itemService.update(id, req);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        itemService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
