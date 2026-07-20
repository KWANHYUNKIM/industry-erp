package com.erp.trade.service;

import com.erp.common.ApiException;
import com.erp.inventory.domain.Item;
import com.erp.inventory.service.ItemService;
import com.erp.trade.domain.Sales;
import com.erp.trade.domain.SalesLine;
import com.erp.trade.domain.SalesPlan;
import com.erp.trade.dto.SalesPlanDtos.ComparisonRow;
import com.erp.trade.dto.SalesPlanDtos.CreateSalesPlanRequest;
import com.erp.trade.dto.SalesPlanDtos.SalesPlanResponse;
import com.erp.trade.repository.SalesPlanRepository;
import com.erp.trade.repository.SalesRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 매출계획: 품목별 월 목표(수량·금액)의 CRUD와, 판매 실적 대조(비교표).
 * 실적은 저장하지 않고 판매(Sales) 집계로 계산한다.
 */
@Service
@RequiredArgsConstructor
public class SalesPlanService {

    private final SalesPlanRepository planRepository;
    private final SalesRepository salesRepository;   // 같은 모듈(trade)
    private final ItemService itemService;           // inventory 의 공개 API

    @Transactional(readOnly = true)
    public List<SalesPlanResponse> findAll(Integer year) {
        List<SalesPlan> plans = (year != null)
                ? planRepository.findByPlanYearWithItem(year)
                : planRepository.findAllWithItem();
        return plans.stream().map(SalesPlanResponse::from).toList();
    }

    @Transactional
    public SalesPlanResponse create(CreateSalesPlanRequest req, String username) {
        Item item = itemService.get(req.itemId());
        SalesPlan plan = SalesPlan.builder()
                .item(item)
                .planYear(req.planYear())
                .planMonth(req.planMonth())
                .planQty(req.planQty())
                .planAmount(req.planAmount())
                .remark(req.remark())
                .createdBy(username)
                .build();
        return SalesPlanResponse.from(planRepository.save(plan));
    }

    @Transactional
    public void delete(Long id) {
        if (!planRepository.existsById(id)) {
            throw ApiException.notFound("매출계획을 찾을 수 없습니다. id=" + id);
        }
        planRepository.deleteById(id);
    }

    /**
     * 매출계획비교표: 해당 연도의 계획 각 줄에 대해 실적(판매 집계)과 달성률을 채운다.
     * 실적 = 그 (품목, 월)의 판매 라인 supplyAmount/quantity 합.
     */
    @Transactional(readOnly = true)
    public List<ComparisonRow> comparison(int year) {
        List<SalesPlan> plans = planRepository.findByPlanYearWithItem(year);

        // (itemId, month) → 실적 합계
        Map<String, BigDecimal[]> actual = new HashMap<>();
        List<Sales> sales = salesRepository.findWithLinesBySaleDateBetween(
                LocalDate.of(year, 1, 1), LocalDate.of(year, 12, 31));
        for (Sales s : sales) {
            int month = s.getSaleDate().getMonthValue();
            for (SalesLine l : s.getLines()) {
                String key = l.getItem().getId() + "-" + month;
                BigDecimal[] agg = actual.computeIfAbsent(key, k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
                agg[0] = agg[0].add(nz(l.getQuantity()));
                agg[1] = agg[1].add(nz(l.getSupplyAmount()));
            }
        }

        List<ComparisonRow> out = new ArrayList<>();
        for (SalesPlan p : plans) {
            String key = p.getItem().getId() + "-" + p.getPlanMonth();
            BigDecimal[] agg = actual.getOrDefault(key, new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            BigDecimal actualQty = agg[0], actualAmount = agg[1];
            BigDecimal rate = p.getPlanAmount().signum() == 0
                    ? BigDecimal.ZERO
                    : actualAmount.multiply(BigDecimal.valueOf(100))
                        .divide(p.getPlanAmount(), 1, RoundingMode.HALF_UP);
            out.add(new ComparisonRow(
                    p.getId(), p.getPlanYear(), p.getPlanMonth(),
                    p.getItem().getId(), p.getItem().getName(), p.getItem().getUnit(),
                    p.getPlanQty(), p.getPlanAmount(), actualQty, actualAmount, rate));
        }
        return out;
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }
}
