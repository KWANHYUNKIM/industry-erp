package com.erp.inventory.item;

import com.erp.inventory.item.dto.ItemDtos.CreateItemRequest;
import com.erp.inventory.item.dto.ItemDtos.ItemResponse;
import com.erp.inventory.item.dto.ItemDtos.UpdateItemRequest;
import com.erp.inventory.item.dto.ItemDtos.UpdateItemPricesRequest;
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

    @GetMapping("/unused")
    public List<Long> unused(@RequestParam @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate from,
                             @RequestParam @org.springframework.format.annotation.DateTimeFormat(iso = org.springframework.format.annotation.DateTimeFormat.ISO.DATE) java.time.LocalDate to) {
        return itemService.findUnusedIds(from, to);
    }

    @PostMapping
    public ResponseEntity<ItemResponse> create(@Valid @RequestBody CreateItemRequest req) {
        return ResponseEntity.ok(itemService.create(req));
    }

    @PutMapping("/{id}")
    public ItemResponse update(@PathVariable Long id, @Valid @RequestBody UpdateItemRequest req) {
        return itemService.update(id, req);
    }

    /** 품목별단가 화면 — 단가(출고 · 입고 · A ~ J)만 고친다. */
    @PatchMapping("/{id}/prices")
    public ItemResponse updatePrices(@PathVariable Long id, @Valid @RequestBody UpdateItemPricesRequest req) {
        return itemService.updatePrices(id, req);
    }

    /** 리스트 [사용중단/재사용 ▴] › [삭제] — 걸린 자료가 있는 품목은 지우지 않고 돌려준다(원본 '삭제불가코드' 창). */
    @PostMapping("/delete")
    public ItemDtos.DeleteItemsResponse deleteAll(@Valid @RequestBody ItemDtos.DeleteItemsRequest req) {
        return itemService.deleteAll(req.ids());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> delete(@PathVariable Long id) {
        itemService.delete(id);
        return ResponseEntity.noContent().build();
    }
}
