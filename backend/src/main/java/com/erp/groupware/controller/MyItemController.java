package com.erp.groupware.controller;

import com.erp.groupware.dto.MyItemDtos.AddMyItemRequest;
import com.erp.groupware.dto.MyItemDtos.MyItemResponse;
import com.erp.groupware.service.MyItemService;
import com.erp.security.UserPrincipal;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * My품목 — 이카운트 전표 입력 툴바의 [My품목 ▾].
 * 개인 소유물이라 메뉴 권한 카탈로그에 넣지 않는다(E Note 와 같다).
 */
@RestController
@RequestMapping("/api/my-items")
@RequiredArgsConstructor
public class MyItemController {

    private final MyItemService service;

    @GetMapping
    public List<MyItemResponse> list(@AuthenticationPrincipal UserPrincipal principal) {
        return service.findMine(principal.getUsername());
    }

    @PostMapping
    public MyItemResponse add(@Valid @RequestBody AddMyItemRequest req,
                              @AuthenticationPrincipal UserPrincipal principal) {
        return service.add(req, principal.getUsername());
    }

    @DeleteMapping("/{itemId}")
    public ResponseEntity<Void> remove(@PathVariable Long itemId,
                                       @AuthenticationPrincipal UserPrincipal principal) {
        service.remove(itemId, principal.getUsername());
        return ResponseEntity.noContent().build();
    }
}
