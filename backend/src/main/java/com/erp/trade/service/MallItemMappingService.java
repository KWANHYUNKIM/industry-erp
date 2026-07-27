package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.inventory.service.ItemService;
import com.erp.trade.domain.MallItemMapping;
import com.erp.trade.dto.MallItemMappingDtos.CreateMappingRequest;
import com.erp.trade.dto.MallItemMappingDtos.MappingResponse;
import com.erp.trade.dto.MallItemMappingDtos.UpdateMappingRequest;
import com.erp.trade.repository.MallItemMappingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

/** 쇼핑몰 품목코드연결(E041004) CRUD + 수집 자동연결 조회. */
@Service
@RequiredArgsConstructor
public class MallItemMappingService {

    private final MallItemMappingRepository repository;
    private final ItemService itemService;   // inventory 공개 API

    @Transactional(readOnly = true)
    public List<MappingResponse> findAll() {
        return repository.findAllWithItem().stream().map(MappingResponse::from).toList();
    }

    @Transactional
    public MappingResponse create(CreateMappingRequest req) {
        String mall = req.mall().trim();
        String code = req.mallProductCode().trim();
        if (repository.existsByMallAndMallProductCode(mall, code)) {
            throw ApiException.conflict("이미 연결된 몰 품목코드입니다: " + mall + " / " + code);
        }
        MallItemMapping m = MallItemMapping.builder()
                .mall(mall)
                .mallProductCode(code)
                .mallProductName(req.mallProductName())
                .item(itemService.get(req.itemId()))
                .active(true)
                .build();
        return MappingResponse.from(repository.save(m));
    }

    @Transactional
    public MappingResponse update(Long id, UpdateMappingRequest req) {
        MallItemMapping m = get(id);
        m.setMallProductName(req.mallProductName());
        m.setItem(itemService.get(req.itemId()));
        if (req.active() != null) {
            m.setActive(req.active());
        }
        return MappingResponse.from(m);
    }

    @Transactional
    public void delete(Long id) {
        repository.delete(get(id));
    }

    /** 수집 자동연결: (쇼핑몰, 몰품목코드)로 활성 매핑의 itemId 를 찾는다. 없으면 empty. */
    @Transactional(readOnly = true)
    public Optional<Long> resolveItemId(String mall, String mallProductCode) {
        if (mall == null || mallProductCode == null || mallProductCode.isBlank()) {
            return Optional.empty();
        }
        return repository.findActive(mall.trim(), mallProductCode.trim())
                .map(m -> m.getItem().getId());
    }

    private MallItemMapping get(Long id) {
        return repository.findById(id)
                .orElseThrow(() -> ApiException.notFound("몰 품목코드연결을 찾을 수 없습니다. id=" + id));
    }
}
