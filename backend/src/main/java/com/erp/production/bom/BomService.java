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

    /** 모든 버전(줄마다 [BOM버전] 을 고르는 화면이 쓴다). */
    @Transactional(readOnly = true)
    public List<BomResponse> findAllVersions() {
        return bomRepository.findAllVersionsWithProduct().stream().map(BomResponse::from).toList();
    }

    /** 버전 하나(id). 사용하는 쪽이 제품과 맞는지 본다. */
    @Transactional(readOnly = true)
    public Bom getVersion(Long bomId) {
        return bomRepository.findById(bomId).orElseThrow(() -> ApiException.notFound("BOM 버전을 찾을 수 없습니다. id=" + bomId));
    }

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

        String version = req.versionName() == null || req.versionName().isBlank() ? "기본" : req.versionName().trim();
        List<Bom> versions = bomRepository.findVersions(product.getId());
        Bom bom = versions.stream().filter(v -> v.getVersionName().equals(version)).findFirst()
                .orElseGet(() -> Bom.builder().product(product).versionName(version).defaultVersion(false).build());
        // 제품의 첫 BOM 이거나 기본으로 하라고 했으면 이 버전이 기본이다(다른 버전은 기본에서 내린다).
        boolean makeDefault = versions.isEmpty() || Boolean.TRUE.equals(req.defaultVersion()) || bom.isDefaultVersion();
        if (makeDefault && !bom.isDefaultVersion()) {
            versions.stream().filter(Bom::isDefaultVersion).forEach(v -> v.setDefaultVersion(false));
            bomRepository.flush();
        }
        bom.setDefaultVersion(makeDefault);
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
        /* 기본을 지우면 남은 버전 중 하나가 기본이 된다 — 제품에 BOM 이 남아 있는데 기본이 없으면 생산이 막힌다. */
        boolean wasDefault = bom.isDefaultVersion();
        Long productId = bom.getProduct().getId();
        bomRepository.delete(bom);
        bomRepository.flush();
        if (wasDefault) {
            bomRepository.findVersions(productId).stream().findFirst().ifPresent(v -> v.setDefaultVersion(true));
        }
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

    /** 고른 <b>버전</b>으로 푼다(첫 단만 그 버전, 그 아래 반제품은 각자의 기본 BOM). */
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public java.util.List<Exploded> explodeVersion(Long bomId, java.math.BigDecimal qty, boolean all) {
        Bom bom = getVersion(bomId);
        java.util.Map<Long, Exploded> out = new java.util.LinkedHashMap<>();
        java.util.Deque<Long> path = new java.util.ArrayDeque<>();
        path.push(bom.getProduct().getId());
        for (var line : bom.getLines()) {
            var c = line.getComponent();
            java.math.BigDecimal need = line.getQuantity().multiply(qty);
            if (all && bomRepository.findByProductIdWithProduct(c.getId()).isPresent()) {
                explodeInto(c.getId(), need, true, path, out);
            } else {
                out.merge(c.getId(), new Exploded(c, need),
                        (a, b) -> new Exploded(a.component(), a.quantity().add(b.quantity())));
            }
        }
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
