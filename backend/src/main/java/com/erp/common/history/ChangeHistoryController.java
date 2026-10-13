package com.erp.common.history;

import com.erp.common.history.dto.ChangeHistoryDtos.ChangeHistoryResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/**
 * [H] '이력' 읽기 — GET /api/change-history?target=PARTNER&id=1.
 * 만든 때로 '신규' 줄을 지어야 하는 자료(일정 · 공용품)는 자기 모듈이 /{id}/history 를 따로 낸다.
 */
@RestController
@RequestMapping("/api/change-history")
@RequiredArgsConstructor
public class ChangeHistoryController {

    private final ChangeHistoryService service;

    @GetMapping
    public List<ChangeHistoryResponse> list(@RequestParam String target, @RequestParam Long id) {
        return service.list(target, id);
    }
}
