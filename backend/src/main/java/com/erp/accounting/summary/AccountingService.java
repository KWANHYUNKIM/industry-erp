package com.erp.accounting.summary;

import com.erp.production.bom.Bom;
import com.erp.inventory.item.Item;
import com.erp.trade.purchase.Purchase;
import com.erp.trade.sales.Sales;
import com.erp.accounting.summary.dto.AccountingDtos.ItemProfitResponse;
import com.erp.accounting.summary.dto.AccountingDtos.ProfitSummaryResponse;
import com.erp.accounting.summary.dto.AccountingDtos.VatSummaryResponse;
import com.erp.production.bom.BomRepository;
import com.erp.inventory.item.ItemRepository;
import com.erp.trade.purchase.PurchaseLineRepository;
import com.erp.trade.purchase.PurchaseRepository;
import com.erp.trade.sales.SalesLineRepository;
import com.erp.trade.sales.SalesRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.*;
import com.erp.accounting.summary.dto.AccountingDtos;

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
    private final com.erp.accounting.expense.ExpenseRepository expenseRepository;

    /** 매입매출·부가세 요약 */
    @Transactional(readOnly = true)
    /*
     * 기간(과세기간)을 받는다. 예전엔 창업 이래 전 기간을 한데 더해 신고 기초자료로 쓸 수 없었다(47회차).
     * 기간을 안 주면 예전처럼 전체(대시보드 위젯). 지출의 부가세(매입세액)도 공제에 넣는다.
     */
    public VatSummaryResponse vatSummary(LocalDate from, LocalDate to) {
        BigDecimal salesSupply, salesVat, salesTotal, purchaseSupply, purchaseVat, purchaseTotal;
        if (from == null && to == null) {
            salesSupply = salesRepository.sumSupply();
            salesVat = salesRepository.sumVat();
            salesTotal = salesRepository.sumTotal();
            purchaseSupply = purchaseRepository.sumSupply();
            purchaseVat = purchaseRepository.sumVat();
            purchaseTotal = purchaseRepository.sumTotal();
        } else {
            LocalDate f = from != null ? from : LocalDate.of(1, 1, 1);
            LocalDate t = to != null ? to : LocalDate.of(9999, 12, 31);
            Object[] s = salesRepository.sumsBetween(f, t).get(0);
            Object[] p = purchaseRepository.sumsBetween(f, t).get(0);
            salesSupply = (BigDecimal) s[0]; salesVat = (BigDecimal) s[1]; salesTotal = (BigDecimal) s[2];
            purchaseSupply = (BigDecimal) p[0]; purchaseVat = (BigDecimal) p[1]; purchaseTotal = (BigDecimal) p[2];
        }
        BigDecimal expenseVat = expenseRepository.sumVat(from != null ? from : LocalDate.of(1, 1, 1),
                to != null ? to : LocalDate.of(9999, 12, 31));
        return new VatSummaryResponse(
                salesSupply, salesVat, salesTotal,
                purchaseSupply, purchaseVat, purchaseTotal,
                expenseVat,
                salesVat.subtract(purchaseVat).subtract(expenseVat));
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

        /**
         * 매입평균도 BOM 도 없을 때 쓰는 원가 — 품목의 <b>구매단가</b>.
         *
         * <p>예전에는 판매단가(unitPrice)를 썼다. 원가에 판매가를 넣으면 이익이 0 근처로
         * 나오는데 숫자가 그럴듯해서 눈으로는 안 걸린다. 구매단가를 안 정한 품목은 0 을
         * 돌려주고 이름을 '미상' 으로 남긴다 — 판매가를 원가라고 우기는 것보다 낫다.
         */
        private BigDecimal fallbackCost(Item item) {
            BigDecimal pp = item.getPurchasePrice();
            return pp != null && pp.signum() > 0 ? pp : BigDecimal.ZERO;
        }

        Cost costOf(Long itemId) {
            return resolve(itemId, new HashSet<>());
        }

        private Cost resolve(Long itemId, Set<Long> visiting) {
            if (memo.containsKey(itemId)) return memo.get(itemId);
            Item item = items.get(itemId);
            if (item == null) return new Cost(BigDecimal.ZERO, "미상");
            if (!visiting.add(itemId)) {
                // 순환 방지: 품목 구매단가로 대체
                return new Cost(fallbackCost(item), "구매단가");
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
                cost = new Cost(fallbackCost(item), "구매단가");
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
        // 제품마다 기본 BOM(버전이 여럿이면 기본으로 원가를 본다 — V226).
        bomRepository.findAllWithProduct().forEach(b -> ctx.bomByProduct.put(b.getProduct().getId(), b));
        return ctx;
    }
}
