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

    /**
     * 원본 BOM 정전개 — 제품에서 아래로 끝까지(반제품은 각자의 기본 BOM 으로) 들여쓴 줄. 첫 단은 고른 버전(없으면 기본).
     * 순환이면 거절한다.
     */
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public java.util.List<com.erp.production.bom.dto.BomDtos.TreeNode> forwardTree(Long productId, Long bomId) {
        Bom top = bomId != null ? getVersion(bomId)
                : bomRepository.findByProductIdWithProduct(productId)
                    .orElseThrow(() -> ApiException.badRequest("BOM 이 등록되지 않은 품목입니다."));
        var out = new java.util.ArrayList<com.erp.production.bom.dto.BomDtos.TreeNode>();
        var p = top.getProduct();
        out.add(new com.erp.production.bom.dto.BomDtos.TreeNode(0, p.getId(), p.getCode(), p.getName(), p.getSpec(), p.getUnit(),
                java.math.BigDecimal.ONE, java.math.BigDecimal.ONE, top.getVersionName(), !top.getLines().isEmpty()));
        java.util.Deque<Long> path = new java.util.ArrayDeque<>();
        path.push(p.getId());
        forward(top, 1, java.math.BigDecimal.ONE, path, out);
        return out;
    }

    private void forward(Bom bom, int level, java.math.BigDecimal mult, java.util.Deque<Long> path,
                         java.util.List<com.erp.production.bom.dto.BomDtos.TreeNode> out) {
        for (var line : bom.getLines()) {
            var c = line.getComponent();
            if (path.contains(c.getId())) throw ApiException.badRequest("BOM 이 자기 자신을 다시 부릅니다(순환): " + c.getCode());
            var child = bomRepository.findByProductIdWithProduct(c.getId()).orElse(null);
            java.math.BigDecimal total = line.getQuantity().multiply(mult);
            out.add(new com.erp.production.bom.dto.BomDtos.TreeNode(level, c.getId(), c.getCode(), c.getName(), c.getSpec(), c.getUnit(),
                    line.getQuantity(), total, child != null ? child.getVersionName() : null, child != null));
            if (child != null) {
                path.push(c.getId());
                forward(child, level + 1, total, path, out);
                path.pop();
            }
        }
    }

    /**
     * 원본 BOM 역전개 — 이 품목을 쓰는 제품들을 위로 끝까지(기본 BOM 기준). 0 단이 고른 품목이고,
     * 그 아래 줄들이 "이 품목을 qty 개 쓰는 윗 품목" 이다(누적은 위로 올라가며 곱한다).
     */
    @org.springframework.transaction.annotation.Transactional(readOnly = true)
    public java.util.List<com.erp.production.bom.dto.BomDtos.TreeNode> whereUsed(Long itemId) {
        var item = itemService.get(itemId);
        java.util.Map<Long, java.util.List<java.util.Map.Entry<Bom, java.math.BigDecimal>>> parentsOf = new java.util.HashMap<>();
        for (Bom b : bomRepository.findAllWithProduct()) {
            for (var l : b.getLines()) parentsOf.computeIfAbsent(l.getComponent().getId(), k -> new java.util.ArrayList<>()).add(java.util.Map.entry(b, l.getQuantity()));
        }
        var out = new java.util.ArrayList<com.erp.production.bom.dto.BomDtos.TreeNode>();
        out.add(new com.erp.production.bom.dto.BomDtos.TreeNode(0, item.getId(), item.getCode(), item.getName(), item.getSpec(), item.getUnit(),
                java.math.BigDecimal.ONE, java.math.BigDecimal.ONE, null, parentsOf.containsKey(itemId)));
        java.util.Deque<Long> path = new java.util.ArrayDeque<>();
        path.push(itemId);
        upward(itemId, 1, java.math.BigDecimal.ONE, parentsOf, path, out);
        return out;
    }

    private void upward(Long itemId, int level, java.math.BigDecimal mult,
                        java.util.Map<Long, java.util.List<java.util.Map.Entry<Bom, java.math.BigDecimal>>> parentsOf,
                        java.util.Deque<Long> path, java.util.List<com.erp.production.bom.dto.BomDtos.TreeNode> out) {
        for (var e : parentsOf.getOrDefault(itemId, java.util.List.of())) {
            var p = e.getKey().getProduct();
            if (path.contains(p.getId())) continue;
            // 윗 품목 하나를 만들려면 이 품목이 qty 개 — 맨 아래 품목 하나는 윗 품목 1/qty 개 분이다(누적은 소요량을 곱해 둔다).
            java.math.BigDecimal total = e.getValue().multiply(mult);
            out.add(new com.erp.production.bom.dto.BomDtos.TreeNode(level, p.getId(), p.getCode(), p.getName(), p.getSpec(), p.getUnit(),
                    e.getValue(), total, e.getKey().getVersionName(), parentsOf.containsKey(p.getId())));
            path.push(p.getId());
            upward(p.getId(), level + 1, total, parentsOf, path, out);
            path.pop();
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
