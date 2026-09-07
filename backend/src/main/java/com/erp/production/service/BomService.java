package com.erp.production.service;

import com.erp.common.ApiException;
import com.erp.production.domain.Bom;
import com.erp.production.domain.BomLine;
import com.erp.inventory.domain.Item;
import com.erp.production.dto.BomDtos.BomResponse;
import com.erp.production.dto.BomDtos.SaveBomRequest;
import com.erp.production.repository.BomRepository;
import com.erp.inventory.service.ItemService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.erp.production.dto.BomDtos;

@Service
@RequiredArgsConstructor
public class BomService {

    private final BomRepository bomRepository;
    /*
     * 사용중지한 품목은 BOM 에 새로 들어갈 수 없다. 들어가면 그 자재를 앞으로 계속
     * 소모하겠다는 뜻이 되고, 소요량전개·MRP 가 그걸 사라고 한다.
     * 이미 들어가 있던 줄도 다시 저장할 때 걸린다 — 그 자리에서 자재를 바꾸라는 뜻이다.
     */
    private final ItemService itemService;

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
        Item product = itemService.getUsable(req.productId());

        Bom bom = bomRepository.findByProductIdWithProduct(product.getId())
                .orElseGet(() -> Bom.builder().product(product).build());
        bom.setRemark(req.remark());
        bom.setActive(true);
        bom.clearLines();

        req.lines().forEach(lr -> {
            if (lr.componentId().equals(product.getId())) {
                throw ApiException.badRequest("제품 자신을 자재로 넣을 수 없습니다.");
            }
            Item component = itemService.getUsable(lr.componentId());
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
