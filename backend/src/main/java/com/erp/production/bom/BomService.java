package com.erp.production.bom;

import com.erp.common.ApiException;
import com.erp.inventory.item.Item;
import com.erp.production.bom.dto.BomDtos.BomResponse;
import com.erp.production.bom.dto.BomDtos.SaveBomRequest;
import com.erp.inventory.item.ItemService;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import com.erp.production.bom.dto.BomDtos;

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

    /** BOM 을 푼 한 줄 — 자재와 그 양(생산수량을 곱한 뒤). */
    public record Exploded(com.erp.inventory.item.Item component, java.math.BigDecimal quantity) {}

    /**
     * BOM 풀기. 원본 생산입고·생산불출의 [BOM풀기] 갈래 — <b>1단계</b>는 바로 아래 자재만,
     * <b>전체</b>는 자재가 다시 BOM 을 가진 반제품이면 그 아래까지 끝까지 내려가 원재료로 바꾼다.
     *
     * <p>같은 자재가 여러 갈래에서 나오면 한 줄로 합친다. 제품이 돌고 돌아 자신을 다시 부르면(순환)
     * 거절한다 — 끝없이 내려간다. BOM 이 없으면 빈 목록이다(부르는 쪽이 판단한다).
     */
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public java.util.List<Exploded> explode(Long productId, java.math.BigDecimal qty, boolean all) {
        java.util.Map<Long, Exploded> out = new java.util.LinkedHashMap<>();
        explodeInto(productId, qty, all, new java.util.ArrayDeque<>(), out);
        return new java.util.ArrayList<>(out.values());
    }

    private void explodeInto(Long productId, java.math.BigDecimal qty, boolean all,
                             java.util.Deque<Long> path, java.util.Map<Long, Exploded> out) {
        if (path.contains(productId)) {
            throw com.erp.common.ApiException.badRequest("BOM 이 자기 자신을 다시 부릅니다(순환). 품목 id=" + productId);
        }
        var bom = bomRepository.findByProductIdWithProduct(productId).orElse(null);
        if (bom == null) return;
        path.push(productId);
        for (var line : bom.getLines()) {
            var c = line.getComponent();
            java.math.BigDecimal need = line.getQuantity().multiply(qty);
            boolean hasChild = all && bomRepository.findByProductIdWithProduct(c.getId()).isPresent();
            if (hasChild) {
                explodeInto(c.getId(), need, true, path, out);
            } else {
                out.merge(c.getId(), new Exploded(c, need),
                        (a, b) -> new Exploded(a.component(), a.quantity().add(b.quantity())));
            }
        }
        path.pop();
    }
}
