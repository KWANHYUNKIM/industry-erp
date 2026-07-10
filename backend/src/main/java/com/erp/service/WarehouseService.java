package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.Warehouse;
import com.erp.dto.WarehouseDtos.CreateWarehouseRequest;
import com.erp.dto.WarehouseDtos.UpdateWarehouseRequest;
import com.erp.dto.WarehouseDtos.WarehouseResponse;
import com.erp.repository.WarehouseRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class WarehouseService {

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
        Warehouse w = Warehouse.builder()
                .code(req.code())
                .name(req.name())
                .location(req.location())
                .active(true)
                .build();
        return WarehouseResponse.from(warehouseRepository.save(w));
    }

    @Transactional
    public WarehouseResponse update(Long id, UpdateWarehouseRequest req) {
        Warehouse w = getWarehouse(id);
        w.setName(req.name());
        w.setLocation(req.location());
        if (req.active() != null) {
            w.setActive(req.active());
        }
        return WarehouseResponse.from(w);
    }

    @Transactional
    public void delete(Long id) {
        warehouseRepository.delete(getWarehouse(id));
    }

    private Warehouse getWarehouse(Long id) {
        return warehouseRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("창고를 찾을 수 없습니다. id=" + id));
    }
}
