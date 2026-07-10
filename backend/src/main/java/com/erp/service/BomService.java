package com.erp.service;

import com.erp.common.ApiException;
import com.erp.domain.Bom;
import com.erp.domain.BomLine;
import com.erp.domain.Item;
import com.erp.dto.BomDtos.BomResponse;
import com.erp.dto.BomDtos.SaveBomRequest;
import com.erp.repository.BomRepository;
import com.erp.repository.ItemRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
@RequiredArgsConstructor
public class BomService {

    private final BomRepository bomRepository;
    private final ItemRepository itemRepository;

    @Transactional(readOnly = true)
    public List<BomResponse> findAll() {
        // 라인까지 로딩 (제품은 fetch join, 라인은 지연 → 트랜잭션 내 접근)
        return bomRepository.findAllWithProduct().stream()
                .map(BomResponse::from)
                .toList();
    }

    /** 제품 기준 BOM 저장(있으면 자재라인 교체, 없으면 생성) */
    @Transactional
    public BomResponse save(SaveBomRequest req) {
        Item product = itemRepository.findById(req.productId())
                .orElseThrow(() -> ApiException.notFound("제품을 찾을 수 없습니다. id=" + req.productId()));

        Bom bom = bomRepository.findByProductIdWithProduct(product.getId())
                .orElseGet(() -> Bom.builder().product(product).build());
        bom.setRemark(req.remark());
        bom.setActive(true);
        bom.clearLines();

        req.lines().forEach(lr -> {
            if (lr.componentId().equals(product.getId())) {
                throw ApiException.badRequest("제품 자신을 자재로 넣을 수 없습니다.");
            }
            Item component = itemRepository.findById(lr.componentId())
                    .orElseThrow(() -> ApiException.notFound("자재를 찾을 수 없습니다. id=" + lr.componentId()));
            bom.addLine(BomLine.builder().component(component).quantity(lr.quantity()).build());
        });

        return BomResponse.from(bomRepository.save(bom));
    }

    @Transactional
    public void delete(Long id) {
        Bom bom = bomRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("BOM을 찾을 수 없습니다. id=" + id));
        bomRepository.delete(bom);
    }
}
