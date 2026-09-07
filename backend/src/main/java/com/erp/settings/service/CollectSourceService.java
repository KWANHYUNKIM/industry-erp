package com.erp.settings.service;

import com.erp.common.ApiException;
import com.erp.settings.domain.CollectSource;
import com.erp.settings.dto.CollectSourceDtos.CollectSourceResponse;
import com.erp.settings.dto.CollectSourceDtos.CreateCollectSourceRequest;
import com.erp.settings.dto.CollectSourceDtos.UpdateCollectSourceRequest;
import com.erp.settings.repository.CollectSourceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

/** 수집데이터 소스 등록(E100000) CRUD. 데이터센터 수집 화면이 이 목록을 읽어 실행한다. */
@Service
@RequiredArgsConstructor
public class CollectSourceService {

    private final CollectSourceRepository repository;

    @Transactional(readOnly = true)
    public List<CollectSourceResponse> findAll() {
        return repository.findAllByOrderBySortOrderAscIdAsc().stream()
                .map(CollectSourceResponse::from).toList();
    }

    @Transactional
    public CollectSourceResponse create(CreateCollectSourceRequest req) {
        CollectSource s = CollectSource.builder()
                .code(req.code() == null || req.code().isBlank() ? null : req.code().trim())
                .name(req.name().trim())
                .category(req.category().trim())
                .endpoint(req.endpoint().trim())
                .paged(Boolean.TRUE.equals(req.paged()))
                .sortOrder(req.sortOrder() != null ? req.sortOrder() : 0)
                .active(true)
                .build();
        return CollectSourceResponse.from(repository.save(s));
    }

    @Transactional
    public CollectSourceResponse update(Long id, UpdateCollectSourceRequest req) {
        CollectSource s = get(id);
        s.setCode(req.code() == null || req.code().isBlank() ? null : req.code().trim());
        s.setName(req.name().trim());
        s.setCategory(req.category().trim());
        s.setEndpoint(req.endpoint().trim());
        if (req.paged() != null) s.setPaged(req.paged());
        if (req.sortOrder() != null) s.setSortOrder(req.sortOrder());
        if (req.active() != null) s.setActive(req.active());
        return CollectSourceResponse.from(s);
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(get(id));
    }

    private CollectSource get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("수집 소스를 찾을 수 없습니다. id=" + id));
    }
}
