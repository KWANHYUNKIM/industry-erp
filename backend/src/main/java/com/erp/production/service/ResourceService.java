package com.erp.production.service;

import com.erp.common.ApiException;
import com.erp.production.domain.ProductionResource;
import com.erp.production.dto.ResourceDtos.CreateResourceRequest;
import com.erp.production.dto.ResourceDtos.ResourceResponse;
import com.erp.production.dto.ResourceDtos.UpdateResourceRequest;
import com.erp.inventory.service.WarehouseService;
import com.erp.production.domain.ProductionProcess;
import com.erp.production.repository.ProcessRepository;
import com.erp.production.repository.ResourceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;
import com.erp.production.dto.ResourceDtos;

@Service
@RequiredArgsConstructor
public class ResourceService {

    private final ResourceRepository resourceRepository;
    private final ProcessRepository processRepository;
    private final ProcessService processService;
    private final WarehouseService warehouseService;

    @Transactional(readOnly = true)
    public List<ResourceResponse> findAll() {
        return resourceRepository.findAll(Sort.by(Sort.Direction.ASC, "code")).stream()
                .map(ResourceResponse::from)
                .toList();
    }

    @Transactional
    public ResourceResponse create(CreateResourceRequest req) {
        if (resourceRepository.existsByCode(req.code())) {
            throw ApiException.conflict("이미 존재하는 자원코드입니다: " + req.code());
        }
        ProductionResource r = ProductionResource.builder()
                .code(req.code())
                .name(req.name())
                .type(req.type() != null && !req.type().isBlank() ? req.type() : "설비")
                .capacity(req.capacity() != null ? req.capacity() : BigDecimal.ZERO)
                .unit(req.unit())
                .costPerHr(req.costPerHr() != null ? req.costPerHr() : BigDecimal.ZERO)
                .warehouse(req.warehouseId() != null ? warehouseService.get(req.warehouseId()) : null)
                .process(processOf(req.processId()))
                .active(true)
                .build();
        return ResourceResponse.from(resourceRepository.save(r));
    }

    @Transactional
    public ResourceResponse update(Long id, UpdateResourceRequest req) {
        ProductionResource r = getResource(id);
        r.setName(req.name());
        if (req.type() != null && !req.type().isBlank()) {
            r.setType(req.type());
        }
        if (req.capacity() != null) {
            r.setCapacity(req.capacity());
        }
        r.setUnit(req.unit());
        if (req.costPerHr() != null) {
            r.setCostPerHr(req.costPerHr());
        }
        // 위치·대상작업은 null 로 지울 수 있어야 한다(자리를 비우거나 작업을 뗀다).
        r.setWarehouse(req.warehouseId() != null ? warehouseService.get(req.warehouseId()) : null);
        r.setProcess(processOf(req.processId()));
        if (req.active() != null) {
            r.setActive(req.active());
        }
        return ResourceResponse.from(r);
    }

    /** 대상작업(공정). 없는 id 를 주면 조용히 무시하지 않고 알린다. */
    /** 사용중지한 공정에 설비를 새로 붙일 수는 없다. 안 정할 수는 있다. */
    private ProductionProcess processOf(Long processId) {
        if (processId == null) return null;
        return processService.getUsable(processId);
    }

    @Transactional
    public void delete(Long id) {
        resourceRepository.delete(getResource(id));
    }

    /** 새로 고르는 자리에서 쓴다. 사용중지한 설비로 새 작업을 올릴 수는 없다. */
    @Transactional(readOnly = true)
    public ProductionResource getUsable(Long id) {
        ProductionResource r = getResource(id);
        if (!r.isActive()) {
            throw ApiException.badRequest(
                    "사용중지된 자원입니다: " + r.getCode() + " " + r.getName());
        }
        return r;
    }

    private ProductionResource getResource(Long id) {
        return resourceRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("자원을 찾을 수 없습니다. id=" + id));
    }
}
