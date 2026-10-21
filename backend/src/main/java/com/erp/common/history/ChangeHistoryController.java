package com.erp.common.history;

import com.erp.common.history.dto.ChangeHistoryDtos.ChangeHistoryResponse;
import com.erp.common.history.dto.ChangeHistoryDtos.SlipHistoryResponse;
import org.springframework.format.annotation.DateTimeFormat;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
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

    /**
     * 거래이력조회(재고) E040716 — GET /api/change-history/slips?from=&to=&menu=판매&worker=&action=신규&latestOnly=true&byWorkTime=false.
     * menu · action 은 여러 번 줄 수 있다.
     */
    @GetMapping("/slips")
    public List<SlipHistoryResponse> slips(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                           @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                           @RequestParam(required = false) List<String> menu,
                                           @RequestParam(required = false) String worker,
                                           @RequestParam(required = false) List<String> action,
                                           @RequestParam(defaultValue = "true") boolean latestOnly,
                                           @RequestParam(defaultValue = "false") boolean byWorkTime) {
        return service.searchSlips(from, to, menu, worker, action, latestOnly, byWorkTime);
    }
}
