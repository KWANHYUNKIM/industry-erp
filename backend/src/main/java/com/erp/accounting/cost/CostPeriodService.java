package com.erp.accounting.cost;

import com.erp.accounting.cost.dto.CostPeriodDtos.CostPeriodResponse;
import com.erp.accounting.cost.dto.CostPeriodDtos.CostRunResult;
import com.erp.accounting.cost.dto.CostPeriodDtos.CreateCostPeriodRequest;
import com.erp.common.ApiException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;

/**
 * 원본 이익관리 &gt; 원가생성/수정(E040802) — 원가 기간을 만들고 그 기간에 사전작업 · 원가계산 · 삭제를 한다.
 *
 * <p>2026-10-12 loginaa 실측 흐름: [신규] → 기본등록 저장 → 맨 위에 새 줄(시작월은 앞 기간 다음 달) →
 * 원가생성전 점검사항이 저절로 뜬다 → 사전작업 [노무비/경비등록] · [표준원가생성] → 원가계산 [생성] →
 * 원가현황 [조회] · [삭제]. 버튼이 펼쳐진 것은 맨 위(가장 최근) 줄뿐이다 — 지나간 기간은 손대지 않는다.
 * [삭제] 는 '삭제한 데이터는 복구되지 않습니다.' 를 묻고 그 기간의 원가까지 지운다.
 */
@Service
@RequiredArgsConstructor
public class CostPeriodService {

    private final CostPeriodRepository periodRepository;
    private final ItemCostRepository itemCostRepository;
    private final CostService costService;
    private final com.erp.inventory.stock.StockService stockService;
    private final com.erp.trade.purchase.PurchaseService purchaseService;

    @Transactional(readOnly = true)
    public List<CostPeriodResponse> findAll() {
        List<CostPeriod> all = periodRepository.findAllByOrderByStartMonthDesc();
        List<CostPeriodResponse> out = new ArrayList<>();
        for (int i = 0; i < all.size(); i++) out.add(CostPeriodResponse.from(all.get(i), i == 0));
        return out;
    }

    @Transactional
    public CostPeriodResponse create(CreateCostPeriodRequest req) {
        YearMonth start = periodRepository.findFirstByOrderByStartMonthDesc()
                .map(p -> YearMonth.parse(p.getEndMonth()).plusMonths(1))
                .orElseGet(() -> {
                    if (req.startMonth() == null || req.startMonth().isBlank()) {
                        throw ApiException.badRequest("시작월을 입력하세요.");
                    }
                    return YearMonth.parse(req.startMonth());
                });
        YearMonth end = YearMonth.parse(req.endMonth());
        if (end.isBefore(start)) {
            throw ApiException.badRequest("종료월은 시작월(" + start + ") 보다 빠를 수 없습니다.");
        }
        CostPeriod saved = periodRepository.save(CostPeriod.builder()
                .startMonth(start.toString()).endMonth(end.toString())
                .method(req.method()).outsourcingBasis(req.outsourcingBasis()).build());
        return CostPeriodResponse.from(saved, true);
    }

    /** 사전작업 [표준원가생성] — 기간의 달마다 원가계산법으로 자재 단가를 잰다. */
    @Transactional
    public CostRunResult buildStandard(Long id) {
        CostPeriod p = latest(id);
        if (p.getMethod() == CostMethod.FIFO) {
            throw ApiException.badRequest("선입선출법은 입고분별 잔량(입고 레이어)을 남기지 않아 계산할 수 없습니다. 총평균법이나 최종매입원가법으로 기간을 다시 만드세요.");
        }
        String basis = p.getMethod() == CostMethod.TOTAL_AVERAGE ? "WEIGHTED_AVG" : "LAST_PURCHASE";
        int rows = 0;
        List<String> months = months(p);
        for (String m : months) rows += costService.build(m, basis).size();
        return new CostRunResult(months.size(), rows);
    }

    /** 원가계산 [생성] — 기간의 달마다 생산실적 · 노무비/경비로 실제원가를 낸다. */
    @Transactional
    public CostRunResult generate(Long id) {
        return generate(id, null);
    }

    /**
     * 원가계산 [생성]. 계산한 때의 <b>기초수량 · 그 달 구매수량/금액 · 계산한 사람/때</b>를 원가 행에 남긴다 —
     * [수량비교] · [전월금액비교] 가 나중에 장부와 견주고 [이력] 이 보여 준다(원본 E040802 2026-10-13 실측).
     */
    @Transactional
    public CostRunResult generate(Long id, String username) {
        CostPeriod p = latest(id);
        int rows = 0;
        List<String> months = months(p);
        java.time.LocalDateTime now = java.time.LocalDateTime.now();
        for (String m : months) {
            rows += costService.calcActual(m).size();
            YearMonth ym = YearMonth.parse(m);
            java.util.Map<Long, java.math.BigDecimal> opening = bookOpening(ym);
            java.util.Map<Long, java.math.BigDecimal[]> bought = purchaseService.purchaseByItem(ym.atDay(1), ym.atEndOfMonth());
            for (ItemCost c : itemCostRepository.findRangeWithItem(m, m)) {
                Long itemId = c.getItem().getId();
                c.setOpeningQty(opening.getOrDefault(itemId, java.math.BigDecimal.ZERO));
                java.math.BigDecimal[] b = bought.get(itemId);
                c.setPurchaseQty(b != null ? b[0] : java.math.BigDecimal.ZERO);
                c.setPurchaseAmount(b != null ? b[1] : java.math.BigDecimal.ZERO);
                c.setCalcBy(username);
                c.setCalcAt(now);
            }
        }
        p.setGenerated(true);
        return new CostRunResult(months.size(), rows);
    }

    /** 장부(재고수불) 기초수량 — 그 달 1일 앞까지 순증감. 수불이 없는 품목은 맵에 없다. */
    private java.util.Map<Long, java.math.BigDecimal> bookOpening(YearMonth ym) {
        java.util.Map<Long, java.math.BigDecimal> out = new java.util.HashMap<>();
        for (var r : stockService.movement(ym.atDay(1), ym.atEndOfMonth(), null)) out.put(r.itemId(), r.opening());
        return out;
    }

    private static String nameSpec(ItemCost c) {
        return c.getItem().getName();
    }

    private static java.math.BigDecimal nz(java.math.BigDecimal v) { return v != null ? v : java.math.BigDecimal.ZERO; }

    /**
     * 원가현황 [수량비교] — 원본 '재고수량 Checklist'(2026-10-13 실측): 품목코드 · 품목명[규격] · 장부 기초수량 ·
     * 월별원가 기초수량 · 차이(= 장부 − 월별원가), 차이 작은 차례. 머리 기간은 그 원가 기간의 시작달.
     */
    @Transactional(readOnly = true)
    public com.erp.accounting.cost.dto.CostPeriodDtos.Checklist<com.erp.accounting.cost.dto.CostPeriodDtos.QtyCompareRow> qtyCompare(Long id) {
        CostPeriod p = periodRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("원가 기간을 찾을 수 없습니다. id=" + id));
        String m = p.getStartMonth();
        java.util.Map<Long, java.math.BigDecimal> book = bookOpening(YearMonth.parse(m));
        List<com.erp.accounting.cost.dto.CostPeriodDtos.QtyCompareRow> rows = new ArrayList<>();
        for (ItemCost c : itemCostRepository.findRangeWithItem(m, m)) {
            java.math.BigDecimal b = book.get(c.getItem().getId());
            java.math.BigDecimal k = c.getOpeningQty();
            rows.add(new com.erp.accounting.cost.dto.CostPeriodDtos.QtyCompareRow(
                    c.getItem().getCode(), nameSpec(c), c.getItem().getSpec(), b, k, nz(b).subtract(nz(k))));
        }
        rows.sort(java.util.Comparator.comparing(com.erp.accounting.cost.dto.CostPeriodDtos.QtyCompareRow::diff));
        return new com.erp.accounting.cost.dto.CostPeriodDtos.Checklist<>(m, m, rows);
    }

    /**
     * 원가현황 [전월금액비교] — 원본 '금액비교 Checklist'(2026-10-13 실측, 2026/10 기간에서 열면 머리 2026/09 ~ 2026/09):
     * 현재기준 전월 구매수량 · 구매금액 / 이전 월별원가 구매수량 · 구매금액 / 수량차이 · 금액차이(= 지금 − 그때), 금액차이 작은 차례.
     * 어긋난 품목만 싣는다(원본 19줄 모두 차이가 있었다). 전월 원가를 계산하지 않았으면 빈 표다.
     */
    @Transactional(readOnly = true)
    public com.erp.accounting.cost.dto.CostPeriodDtos.Checklist<com.erp.accounting.cost.dto.CostPeriodDtos.AmountCompareRow> amountCompare(Long id) {
        CostPeriod p = periodRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("원가 기간을 찾을 수 없습니다. id=" + id));
        YearMonth prev = YearMonth.parse(p.getStartMonth()).minusMonths(1);
        String m = prev.toString();
        java.util.Map<Long, java.math.BigDecimal[]> now = purchaseService.purchaseByItem(prev.atDay(1), prev.atEndOfMonth());
        List<com.erp.accounting.cost.dto.CostPeriodDtos.AmountCompareRow> rows = new ArrayList<>();
        for (ItemCost c : itemCostRepository.findRangeWithItem(m, m)) {
            if (c.getCalcAt() == null) continue;
            java.math.BigDecimal[] n = now.get(c.getItem().getId());
            java.math.BigDecimal nq = n != null ? n[0] : java.math.BigDecimal.ZERO;
            java.math.BigDecimal na = n != null ? n[1] : java.math.BigDecimal.ZERO;
            java.math.BigDecimal qd = nq.subtract(nz(c.getPurchaseQty()));
            java.math.BigDecimal ad = na.subtract(nz(c.getPurchaseAmount()));
            if (qd.signum() == 0 && ad.signum() == 0) continue;
            rows.add(new com.erp.accounting.cost.dto.CostPeriodDtos.AmountCompareRow(
                    c.getItem().getCode(), nameSpec(c), c.getItem().getSpec(),
                    nq, na, nz(c.getPurchaseQty()), nz(c.getPurchaseAmount()), qd, ad));
        }
        rows.sort(java.util.Comparator.comparing(com.erp.accounting.cost.dto.CostPeriodDtos.AmountCompareRow::amountDiff));
        return new com.erp.accounting.cost.dto.CostPeriodDtos.Checklist<>(m, m, rows);
    }

    /** 기타 [이력] — 원본 열: 품목코드 · 품목명 · 작업자 · 수정시간 · 최종상태('계산'). 계산한 원가 행만. */
    @Transactional(readOnly = true)
    public List<com.erp.accounting.cost.dto.CostPeriodDtos.HistoryRow> history(Long id) {
        CostPeriod p = periodRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("원가 기간을 찾을 수 없습니다. id=" + id));
        List<com.erp.accounting.cost.dto.CostPeriodDtos.HistoryRow> rows = new ArrayList<>();
        for (ItemCost c : itemCostRepository.findRangeWithItem(p.getStartMonth(), p.getEndMonth())) {
            if (c.getCalcAt() == null) continue;
            rows.add(new com.erp.accounting.cost.dto.CostPeriodDtos.HistoryRow(
                    c.getItem().getCode(), c.getItem().getName(), c.getCalcBy(), c.getCalcAt(), "계산"));
        }
        return rows;
    }

    /** 원가현황 [삭제] — 기간과 그 기간에 잡은 원가를 함께 지운다. */
    @Transactional
    public void delete(Long id) {
        CostPeriod p = latest(id);
        itemCostRepository.deleteByPeriodRange(p.getStartMonth(), p.getEndMonth());
        periodRepository.delete(p);
    }

    /** 원본은 맨 위(가장 최근) 줄에만 버튼을 펼친다 — 지나간 기간을 고치면 다음 기간의 기초가 어긋난다. */
    private CostPeriod latest(Long id) {
        CostPeriod p = periodRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("원가 기간을 찾을 수 없습니다. id=" + id));
        CostPeriod top = periodRepository.findFirstByOrderByStartMonthDesc().orElseThrow();
        if (!top.getId().equals(p.getId())) {
            throw ApiException.badRequest("가장 최근 기간(" + top.getStartMonth() + " ~ " + top.getEndMonth() + ")만 작업할 수 있습니다.");
        }
        return p;
    }

    private static List<String> months(CostPeriod p) {
        List<String> out = new ArrayList<>();
        for (YearMonth m = YearMonth.parse(p.getStartMonth()); !m.isAfter(YearMonth.parse(p.getEndMonth())); m = m.plusMonths(1)) {
            out.add(m.toString());
        }
        return out;
    }
}
