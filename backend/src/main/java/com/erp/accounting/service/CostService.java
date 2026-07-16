package com.erp.accounting.service;

import com.erp.common.ApiException;
import com.erp.inventory.domain.Item;
import com.erp.accounting.domain.ItemCost;
import com.erp.accounting.dto.CostDtos.CostResponse;
import com.erp.accounting.dto.CostDtos.CreateCostRequest;
import com.erp.accounting.dto.CostDtos.UpdateCostRequest;
import com.erp.accounting.repository.ItemCostRepository;
import com.erp.inventory.repository.ItemRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import com.erp.accounting.dto.CostDtos;

@Service
@RequiredArgsConstructor
public class CostService {

    // 기준단가 → 표준원가 분해 비율 (재료 60% / 노무 25% / 경비 15%)
    private static final BigDecimal MAT_RATIO = new BigDecimal("0.60");
    private static final BigDecimal LAB_RATIO = new BigDecimal("0.25");
    private static final BigDecimal OH_RATIO = new BigDecimal("0.15");

    private final ItemCostRepository itemCostRepository;
    private final ItemRepository itemRepository;

    @Transactional(readOnly = true)
    public List<CostResponse> findAll(String period) {
        String p = (period == null || period.isBlank()) ? null : period.trim();
        return itemCostRepository.findAllWithItem(p).stream()
                .map(CostResponse::from)
                .toList();
    }

    @Transactional
    public CostResponse create(CreateCostRequest req) {
        Item item = getItem(req.itemId());
        String period = req.period().trim();
        if (itemCostRepository.existsByItemIdAndPeriod(item.getId(), period)) {
            throw ApiException.conflict("이미 해당 기간의 원가가 존재합니다: " + item.getName() + " / " + period);
        }
        ItemCost c = ItemCost.builder()
                .item(item)
                .period(period)
                .materialCost(nz(req.materialCost()))
                .laborCost(nz(req.laborCost()))
                .overheadCost(nz(req.overheadCost()))
                .actualMaterial(nz(req.actualMaterial()))
                .actualLabor(nz(req.actualLabor()))
                .actualOverhead(nz(req.actualOverhead()))
                .build();
        return CostResponse.from(itemCostRepository.save(c));
    }

    @Transactional
    public CostResponse update(Long id, UpdateCostRequest req) {
        ItemCost c = getCost(id);
        if (req.materialCost() != null) c.setMaterialCost(req.materialCost());
        if (req.laborCost() != null) c.setLaborCost(req.laborCost());
        if (req.overheadCost() != null) c.setOverheadCost(req.overheadCost());
        if (req.actualMaterial() != null) c.setActualMaterial(req.actualMaterial());
        if (req.actualLabor() != null) c.setActualLabor(req.actualLabor());
        if (req.actualOverhead() != null) c.setActualOverhead(req.actualOverhead());
        return CostResponse.from(c);
    }

    @Transactional
    public void delete(Long id) {
        itemCostRepository.delete(getCost(id));
    }

    /**
     * seed 품목들에 대해 표준원가를 기준단가(unitPrice) 기반으로 자동 생성한다.
     * 이미 해당 기간 원가가 있으면 건너뛴다.
     */
    @Transactional
    public List<CostResponse> build(String period) {
        if (period == null || period.isBlank()) {
            throw ApiException.badRequest("적용기간(period)을 입력하세요.");
        }
        String p = period.trim();
        List<CostResponse> created = new ArrayList<>();
        for (Item item : itemRepository.findAll()) {
            if (!item.isActive()) continue;
            if (itemCostRepository.existsByItemIdAndPeriod(item.getId(), p)) continue;
            BigDecimal base = item.getUnitPrice() != null ? item.getUnitPrice() : BigDecimal.ZERO;
            BigDecimal mat = scale(base.multiply(MAT_RATIO));
            BigDecimal lab = scale(base.multiply(LAB_RATIO));
            BigDecimal oh = scale(base.multiply(OH_RATIO));
            ItemCost c = ItemCost.builder()
                    .item(item)
                    .period(p)
                    .materialCost(mat)
                    .laborCost(lab)
                    .overheadCost(oh)
                    // 실제원가 초기값은 표준과 동일하게(추후 실적 반영). 조회 시 차이 0.
                    .actualMaterial(mat)
                    .actualLabor(lab)
                    .actualOverhead(oh)
                    .build();
            created.add(CostResponse.from(itemCostRepository.save(c)));
        }
        return created;
    }

    private Item getItem(Long id) {
        return itemRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("품목을 찾을 수 없습니다. id=" + id));
    }

    private ItemCost getCost(Long id) {
        return itemCostRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("원가정보를 찾을 수 없습니다. id=" + id));
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }

    private static BigDecimal scale(BigDecimal v) {
        return v.setScale(2, RoundingMode.HALF_UP);
    }
}
