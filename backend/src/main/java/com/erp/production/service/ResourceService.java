package com.erp.production.service;

import com.erp.common.ApiException;
import com.erp.production.domain.ProductionResource;
import com.erp.production.dto.ResourceDtos.CreateResourceRequest;
import com.erp.production.dto.ResourceDtos.ResourceResponse;
import com.erp.production.dto.ResourceDtos.UpdateResourceRequest;
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
        if (req.active() != null) {
            r.setActive(req.active());
        }
        return ResourceResponse.from(r);
    }

    @Transactional
    public void delete(Long id) {
        resourceRepository.delete(getResource(id));
    }

    private ProductionResource getResource(Long id) {
        return resourceRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("자원을 찾을 수 없습니다. id=" + id));
    }
}
