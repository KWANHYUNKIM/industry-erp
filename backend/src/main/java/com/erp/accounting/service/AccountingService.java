package com.erp.accounting.service;

import com.erp.production.domain.Bom;
import com.erp.inventory.domain.Item;
import com.erp.trade.domain.Purchase;
import com.erp.trade.domain.Sales;
import com.erp.accounting.dto.AccountingDtos.DailyProfitResponse;
import com.erp.accounting.dto.AccountingDtos.ItemProfitResponse;
import com.erp.accounting.dto.AccountingDtos.MonthlyProfitResponse;
import com.erp.accounting.dto.AccountingDtos.ProfitSummaryResponse;
import com.erp.accounting.dto.AccountingDtos.VatSummaryResponse;
import com.erp.production.repository.BomRepository;
import com.erp.inventory.repository.ItemRepository;
import com.erp.trade.repository.PurchaseLineRepository;
import com.erp.trade.repository.PurchaseRepository;
import com.erp.trade.repository.SalesLineRepository;
import com.erp.trade.repository.SalesRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;
import com.erp.accounting.dto.AccountingDtos;

@Service
@RequiredArgsConstructor
public class AccountingService {

    private static final int MONEY_SCALE = 2;

    private final SalesRepository salesRepository;
    private final PurchaseRepository purchaseRepository;
    private final SalesLineRepository salesLineRepository;
    private final PurchaseLineRepository purchaseLineRepository;
    private final ItemRepository itemRepository;
    private final BomRepository bomRepository;

    /** 매입매출·부가세 요약 */
    @Transactional(readOnly = true)
    public VatSummaryResponse vatSummary() {
        BigDecimal salesSupply = salesRepository.sumSupply();
        BigDecimal salesVat = salesRepository.sumVat();
        BigDecimal salesTotal = salesRepository.sumTotal();
        BigDecimal purchaseSupply = purchaseRepository.sumSupply();
        BigDecimal purchaseVat = purchaseRepository.sumVat();
        BigDecimal purchaseTotal = purchaseRepository.sumTotal();
        return new VatSummaryResponse(
                salesSupply, salesVat, salesTotal,
                purchaseSupply, purchaseVat, purchaseTotal,
                salesVat.subtract(purchaseVat));
    }

    /** 품목별 원가·이익 */
    @Transactional(readOnly = true)
    public List<ItemProfitResponse> itemProfit() {
        CostContext ctx = buildCostContext();

        List<ItemProfitResponse> result = new ArrayList<>();
        for (SalesLineRepository.ItemAggregate agg : salesLineRepository.aggregateByItem()) {
            Item item = ctx.items.get(agg.getItemId());
            if (item == null) continue;

            BigDecimal soldQty = agg.getQty();
            BigDecimal salesAmount = agg.getAmount();
            Cost cost = ctx.costOf(item.getId());
            BigDecimal costAmount = cost.value.multiply(soldQty).setScale(MONEY_SCALE, RoundingMode.HALF_UP);
            BigDecimal profit = salesAmount.subtract(costAmount);
            BigDecimal margin = salesAmount.signum() == 0 ? BigDecimal.ZERO
                    : profit.multiply(BigDecimal.valueOf(100)).divide(salesAmount, 1, RoundingMode.HALF_UP);

            result.add(new ItemProfitResponse(
                    item.getId(), item.getCode(), item.getName(), cost.basis,
                    soldQty, salesAmount, cost.value, costAmount, profit, margin));
        }
        result.sort(Comparator.comparing(ItemProfitResponse::code));
        return result;
    }

    /** 손익 요약 */
    @Transactional(readOnly = true)
    public ProfitSummaryResponse profitSummary() {
        BigDecimal totalSales = BigDecimal.ZERO;
        BigDecimal totalCost = BigDecimal.ZERO;
        for (ItemProfitResponse p : itemProfit()) {
            totalSales = totalSales.add(p.salesAmount());
            totalCost = totalCost.add(p.costAmount());
        }
        BigDecimal gross = totalSales.subtract(totalCost);
        BigDecimal margin = totalSales.signum() == 0 ? BigDecimal.ZERO
                : gross.multiply(BigDecimal.valueOf(100)).divide(totalSales, 1, RoundingMode.HALF_UP);
        return new ProfitSummaryResponse(totalSales, totalCost, gross, margin);
    }

    // ===== 이익현황 (매출 - 매입, 공급가 기준) =====

    /** 월별 이익현황 (연도별). revenue=매출 공급가, cost=매입 공급가 */
    @Transactional(readOnly = true)
    public List<MonthlyProfitResponse> monthlyProfit(int year) {
        LocalDate from = LocalDate.of(year, 1, 1);
        LocalDate to = LocalDate.of(year, 12, 31);

        Map<String, BigDecimal> revenueByMonth = new TreeMap<>();
        Map<String, BigDecimal> costByMonth = new TreeMap<>();
        for (Sales s : salesRepository.findBySaleDateBetween(from, to)) {
            String key = String.format("%d-%02d", year, s.getSaleDate().getMonthValue());
            revenueByMonth.merge(key, nz(s.getSupplyAmount()), BigDecimal::add);
        }
        for (Purchase p : purchaseRepository.findByPurchaseDateBetween(from, to)) {
            String key = String.format("%d-%02d", year, p.getPurchaseDate().getMonthValue());
            costByMonth.merge(key, nz(p.getSupplyAmount()), BigDecimal::add);
        }

        Set<String> months = new TreeSet<>();
        months.addAll(revenueByMonth.keySet());
        months.addAll(costByMonth.keySet());

        List<MonthlyProfitResponse> result = new ArrayList<>();
        for (String month : months) {
            BigDecimal revenue = revenueByMonth.getOrDefault(month, BigDecimal.ZERO);
            BigDecimal cost = costByMonth.getOrDefault(month, BigDecimal.ZERO);
            BigDecimal profit = revenue.subtract(cost);
            result.add(new MonthlyProfitResponse(month, revenue, cost, profit, marginRate(profit, revenue)));
        }
        return result;
    }

    /** 일별 이익현황 (기간). revenue=매출 공급가, cost=매입 공급가 */
    @Transactional(readOnly = true)
    public List<DailyProfitResponse> dailyProfit(LocalDate from, LocalDate to) {
        Map<String, BigDecimal> revenueByDay = new TreeMap<>();
        Map<String, BigDecimal> costByDay = new TreeMap<>();
        for (Sales s : salesRepository.findBySaleDateBetween(from, to)) {
            revenueByDay.merge(s.getSaleDate().toString(), nz(s.getSupplyAmount()), BigDecimal::add);
        }
        for (Purchase p : purchaseRepository.findByPurchaseDateBetween(from, to)) {
            costByDay.merge(p.getPurchaseDate().toString(), nz(p.getSupplyAmount()), BigDecimal::add);
        }

        Set<String> days = new TreeSet<>();
        days.addAll(revenueByDay.keySet());
        days.addAll(costByDay.keySet());

        List<DailyProfitResponse> result = new ArrayList<>();
        for (String day : days) {
            BigDecimal revenue = revenueByDay.getOrDefault(day, BigDecimal.ZERO);
            BigDecimal cost = costByDay.getOrDefault(day, BigDecimal.ZERO);
            BigDecimal profit = revenue.subtract(cost);
            result.add(new DailyProfitResponse(day, revenue, cost, profit, marginRate(profit, revenue)));
        }
        return result;
    }

    private static BigDecimal nz(BigDecimal v) {
        return v != null ? v : BigDecimal.ZERO;
    }

    private static BigDecimal marginRate(BigDecimal profit, BigDecimal revenue) {
        return revenue.signum() == 0 ? BigDecimal.ZERO
                : profit.multiply(BigDecimal.valueOf(100)).divide(revenue, 1, RoundingMode.HALF_UP);
    }

    // ===== 원가 계산 =====

    private record Cost(BigDecimal value, String basis) {}

    private static class CostContext {
        Map<Long, Item> items;
        Map<Long, BigDecimal> purchaseAvg;   // 총평균 매입단가
        Map<Long, Bom> bomByProduct;
        Map<Long, Cost> memo = new HashMap<>();

        Cost costOf(Long itemId) {
            return resolve(itemId, new HashSet<>());
        }

        private Cost resolve(Long itemId, Set<Long> visiting) {
            if (memo.containsKey(itemId)) return memo.get(itemId);
            Item item = items.get(itemId);
            if (item == null) return new Cost(BigDecimal.ZERO, "미상");
            if (!visiting.add(itemId)) {
                // 순환 방지: 기준단가로 대체
                return new Cost(item.getUnitPrice(), "기준단가");
            }

            Cost cost;
            BigDecimal avg = purchaseAvg.get(itemId);
            Bom bom = bomByProduct.get(itemId);
            if (avg != null) {
                cost = new Cost(avg, "매입평균");
            } else if (bom != null && !bom.getLines().isEmpty()) {
                BigDecimal sum = BigDecimal.ZERO;
                for (var line : bom.getLines()) {
                    Cost c = resolve(line.getComponent().getId(), visiting);
                    sum = sum.add(c.value.multiply(line.getQuantity()));
                }
                cost = new Cost(sum.setScale(MONEY_SCALE, RoundingMode.HALF_UP), "제조원가");
            } else {
                cost = new Cost(item.getUnitPrice(), "기준단가");
            }

            visiting.remove(itemId);
            memo.put(itemId, cost);
            return cost;
        }
    }

    private CostContext buildCostContext() {
        CostContext ctx = new CostContext();
        ctx.items = new HashMap<>();
        itemRepository.findAll().forEach(i -> ctx.items.put(i.getId(), i));

        ctx.purchaseAvg = new HashMap<>();
        for (PurchaseLineRepository.ItemAggregate agg : purchaseLineRepository.aggregateByItem()) {
            if (agg.getQty() != null && agg.getQty().signum() > 0) {
                ctx.purchaseAvg.put(agg.getItemId(),
                        agg.getAmount().divide(agg.getQty(), MONEY_SCALE, RoundingMode.HALF_UP));
            }
        }

        ctx.bomByProduct = new HashMap<>();
        bomRepository.findAll().forEach(b -> ctx.bomByProduct.put(b.getProduct().getId(), b));
        return ctx;
    }
}
