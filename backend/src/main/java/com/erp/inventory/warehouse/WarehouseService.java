package com.erp.inventory.warehouse;

import com.erp.common.ApiException;
import com.erp.common.history.ChangeHistoryService;
import com.erp.inventory.warehouse.dto.WarehouseDtos.CreateWarehouseRequest;
import com.erp.inventory.warehouse.dto.WarehouseDtos.UpdateWarehouseRequest;
import com.erp.inventory.warehouse.dto.WarehouseDtos.WarehouseResponse;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.erp.inventory.warehouse.dto.WarehouseDtos;

@Service
@RequiredArgsConstructor
public class WarehouseService {

    private static final java.util.List<String> KINDS = java.util.List.of("창고", "공장", "외주");

    private final WarehouseRepository warehouseRepository;
    private final ChangeHistoryService changeHistory;
    /** [H] 이력 대상 이름 — 한 번 정하면 바꾸지 않는다(공용.md '붙이는 법'). */
    public static final String HISTORY_TARGET = "WAREHOUSE";

    @Transactional(readOnly = true)
    public List<WarehouseResponse> findAll() {
        return warehouseRepository.findAll(Sort.by(Sort.Direction.ASC, "code")).stream()
                .map(WarehouseResponse::from)
                .toList();
    }

    @Transactional
    public WarehouseResponse create(CreateWarehouseRequest req) {
        if (warehouseRepository.existsByCode(req.code())) {
            throw ApiException.conflict("이미 존재하는 창고코드입니다: " + req.code());
        }
        String kind = normalizeKind(req.kind());
        requireOutsourcingPartner(kind, req.outsourcingPartnerId());
        Warehouse w = Warehouse.builder()
                .code(req.code())
                .name(req.name())
                .location(req.location())
                .kind(kind)
                .processId(req.processId())
                .outsourcingPartnerId(req.outsourcingPartnerId())
                .active(true)
                .build();
        Warehouse saved = warehouseRepository.save(w);
        changeHistory.record(HISTORY_TARGET, saved.getId(), ChangeHistoryService.CREATED);
        return WarehouseResponse.from(saved);
    }

    @Transactional
    public WarehouseResponse update(Long id, UpdateWarehouseRequest req) {
        Warehouse w = getWarehouse(id);
        boolean wasActive = w.isActive();
        String kind = normalizeKind(req.kind());
        requireOutsourcingPartner(kind, req.outsourcingPartnerId());
        w.setName(req.name());
        w.setLocation(req.location());
        w.setKind(kind);
        // 구분을 바꾸면 안 맞는 연결은 끊는다 — 공장이 아닌데 공정이 붙어 있으면 뜻이 없다.
        w.setProcessId("공장".equals(kind) ? req.processId() : null);
        w.setOutsourcingPartnerId("외주".equals(kind) ? req.outsourcingPartnerId() : null);
        if (req.active() != null) {
            w.setActive(req.active());
        }
        changeHistory.recordUpdate(HISTORY_TARGET, w.getId(), wasActive, w.isActive());
        return WarehouseResponse.from(w);
    }

    /** 구분은 창고·공장·외주 셋이다. 안 주면 창고. */
    private String normalizeKind(String kind) {
        if (kind == null || kind.isBlank()) return "창고";
        String k = kind.trim();
        if (!KINDS.contains(k)) {
            throw ApiException.badRequest("창고 구분은 " + String.join(" · ", KINDS) + " 중 하나여야 합니다: " + k);
        }
        return k;
    }

    /**
     * 외주 창고인데 외주거래처가 없으면 막는다.
     * 어느 외주처에 나가 있는 자재인지 모르는 외주 창고는 이름만 외주인 창고다.
     */
    private void requireOutsourcingPartner(String kind, Long partnerId) {
        if ("외주".equals(kind) && partnerId == null) {
            throw ApiException.badRequest("외주 창고는 외주거래처를 지정해야 합니다.");
        }
    }

    @Transactional
    public void delete(Long id) {
        warehouseRepository.delete(getWarehouse(id));
        changeHistory.record(HISTORY_TARGET, id, ChangeHistoryService.DELETED);
    }

    /** 다른 서비스가 창고 엔티티를 얻는 진입점 (리포지토리를 직접 주입하지 않도록). */
    @Transactional(readOnly = true)
    public Warehouse get(Long id) {
        return getWarehouse(id);
    }

    /**
     * 새 전표에 쓸 창고. <b>사용중단 창고도 받는다</b> — 원본 실측(2026-10-23, 두 번): 코드도움
     * [사용중단포함] 으로 사용중단 창고(200)를 고른 생산입고가 그대로 저장된다.
     */
    @Transactional(readOnly = true)
    public Warehouse getUsable(Long id) {
        return getWarehouse(id);
    }

    private Warehouse getWarehouse(Long id) {
        return warehouseRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("창고를 찾을 수 없습니다. id=" + id));
    }
}
