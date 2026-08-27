package com.erp.inventory.service;

import com.erp.common.ApiException;
import com.erp.inventory.domain.Warehouse;
import com.erp.inventory.dto.WarehouseDtos.CreateWarehouseRequest;
import com.erp.inventory.dto.WarehouseDtos.UpdateWarehouseRequest;
import com.erp.inventory.dto.WarehouseDtos.WarehouseResponse;
import com.erp.inventory.repository.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.erp.inventory.dto.WarehouseDtos;

@Service
@RequiredArgsConstructor
public class WarehouseService {

    private static final java.util.List<String> KINDS = java.util.List.of("창고", "공장", "외주");

    private final WarehouseRepository warehouseRepository;

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
        return WarehouseResponse.from(warehouseRepository.save(w));
    }

    @Transactional
    public WarehouseResponse update(Long id, UpdateWarehouseRequest req) {
        Warehouse w = getWarehouse(id);
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
    }

    /** 다른 서비스가 창고 엔티티를 얻는 진입점 (리포지토리를 직접 주입하지 않도록). */
    @Transactional(readOnly = true)
    public Warehouse get(Long id) {
        return getWarehouse(id);
    }

    /** 새 전표에 쓸 수 있는 창고. 사용중지된 창고면 거절한다. ({@link #get(Long)} 은 조회·삭제용) */
    @Transactional(readOnly = true)
    public Warehouse getUsable(Long id) {
        Warehouse warehouse = getWarehouse(id);
        if (!warehouse.isActive()) {
            throw ApiException.badRequest(
                    "사용중지된 창고입니다: " + warehouse.getCode() + " " + warehouse.getName());
        }
        return warehouse;
    }

    private Warehouse getWarehouse(Long id) {
        return warehouseRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("창고를 찾을 수 없습니다. id=" + id));
    }
}
