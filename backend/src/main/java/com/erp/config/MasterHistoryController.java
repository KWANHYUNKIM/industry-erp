package com.erp.config;

import com.erp.common.history.ChangeHistory;
import com.erp.common.history.ChangeHistoryService;
import com.erp.common.history.dto.ChangeHistoryDtos.MasterHistoryResponse;
import com.erp.inventory.item.Item;
import com.erp.inventory.item.ItemService;
import com.erp.production.bom.BomService;
import com.erp.trade.partner.BusinessPartner;
import com.erp.trade.partner.PartnerService;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.stereotype.Service;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 거래이력조회(재고) [구분] 기초코드 — GET /api/change-history/masters?from=&to=&menu=품목등록&worker=&action=&latestOnly=true.
 * 원본(2026-10-21 loginaa) 메뉴검색은 '거래처등록 · 품목등록 · BOM(소요량)' 셋이고 결과 열은 작업일자 · 코드 · 코드명 · 행위 · 이력(H).
 * 여러 모듈의 이름을 붙이므로 common 이 아니라 config 에 둔다(CLAUDE.md 1장 — 여러 모듈을 아우르는 엔드포인트).
 */
@RestController
@RequestMapping("/api/change-history")
@RequiredArgsConstructor
public class MasterHistoryController {

    private final MasterHistoryService service;

    @GetMapping("/masters")
    public List<MasterHistoryResponse> masters(@RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
                                               @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
                                               @RequestParam(required = false) List<String> menu,
                                               @RequestParam(required = false) String worker,
                                               @RequestParam(required = false) List<String> action,
                                               @RequestParam(defaultValue = "true") boolean latestOnly) {
        return service.search(from, to, menu, worker, action, latestOnly);
    }

    @Service
    @RequiredArgsConstructor
    public static class MasterHistoryService {
        private static final Map<String, String> TARGET_OF_MENU = Map.of("거래처등록", "PARTNER", "품목등록", "ITEM", "BOM(소요량)", "BOM");

        private final ChangeHistoryService history;
        private final ItemService itemService;
        private final PartnerService partnerService;
        private final BomService bomService;

        /* 바깥 트랜잭션을 두지 않는다 — 지운 자료 조회가 던지는 예외가 안쪽 service 트랜잭션을 rollback-only 로 만들어 전체가 500 이 된다. */
        public List<MasterHistoryResponse> search(LocalDate from, LocalDate to, List<String> menus, String worker,
                                                  List<String> actions, boolean latestOnly) {
            List<String> targets = (menus == null || menus.isEmpty() ? TARGET_OF_MENU.keySet().stream().toList() : menus).stream()
                    .map(TARGET_OF_MENU::get).filter(java.util.Objects::nonNull).toList();
            return history.searchMasters(from, to, targets, worker, actions, latestOnly).stream().map(h -> {
                String code = "";
                String name = "";
                try {
                    switch (h.getTarget()) {
                        case "ITEM" -> { Item i = itemService.get(h.getTargetId()); code = i.getCode(); name = i.getName(); }
                        case "PARTNER" -> { BusinessPartner p = partnerService.get(h.getTargetId()); code = p.getCode(); name = p.getName(); }
                        case "BOM" -> { String[] l = bomService.productLabel(h.getTargetId()); code = l[0]; name = l[1]; }
                        default -> { }
                    }
                } catch (RuntimeException ignored) { /* 지운 자료는 코드를 모른다 */ }
                return new MasterHistoryResponse(h.getId(), h.getTarget(), h.getTargetId(), h.getWorkedAt(), h.getAction(),
                        h.getWorker(), code, name);
            }).toList();
        }
    }
}
