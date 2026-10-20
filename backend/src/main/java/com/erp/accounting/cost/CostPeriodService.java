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
    private final CostLedgerRepository ledgerRepository;
    private final com.erp.production.bor.BorService borService;
    private final jakarta.persistence.EntityManager entityManager;
    private final com.erp.accounting.processexpense.ProcessExpenseService processExpenseService;

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
        // 원본: 표준원가 = 품목등록 원가 탭 값, 다시 만들면 덮어쓴다. 줄은 그 달 재고 기록이 있는 품목에만(2026-10-20 실측).
        int rows = 0;
        List<String> months = months(p);
        for (String m : months) {
            YearMonth ym = YearMonth.parse(m);
            List<Long> ids = new ArrayList<>();
            for (var r : stockService.movement(ym.atDay(1), ym.atEndOfMonth(), null, false)) {
                if (nz(r.opening()).signum() != 0 || nz(r.inQty()).signum() != 0 || nz(r.outQty()).signum() != 0) ids.add(r.itemId());
            }
            rows += costService.buildStandard(m, ids).size();
        }
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
        buildLedger(p);
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

    /** 원가현황 [삭제] — 기간과 그 기간에 잡은 원가 · 노무비/경비 줄을 함께 지운다(원본: 기간을 지우면 그 기간 자료가 다 사라진다). */
    @Transactional
    public void delete(Long id) {
        CostPeriod p = latest(id);
        ledgerRepository.deleteByPeriodId(p.getId());
        processExpenseService.deleteByPeriodRange(p.getStartMonth(), p.getEndMonth());
        itemCostRepository.deleteByPeriodRange(p.getStartMonth(), p.getEndMonth());
        periodRepository.delete(p);
    }

    /* ───────────── 원가계산내역 (원가계산 [수정] · [기말금액재계산]) ───────────── */

    /**
     * [생성] 이 원가계산내역을 다시 채운다 — 품목마다 장부로:
     * 기초수량 = 재고수불 기초, 기초금액 = 앞 기간 기말금액(수량이 다르면 앞 기간 기말단가 × 수량, 앞 기간이 없으면 표준원가 × 수량),
     * 구매 = 구매전표, 생산입고 = 생산실적 × 실제재료비 단가, 노무비 · 경비 = 생산수량 × 실제노무비 · 실제경비 단가,
     * 조정/대체/반품 = 나머지 입고(금액 0), 감소 = 출고. 그리고 총평균으로 감소 · 기말 금액을 낸다.
     * 외주비는 외주 입고를 따로 남기지 않아 0 이다.
     */
    private void buildLedger(CostPeriod p) {
        ledgerRepository.deleteByPeriodId(p.getId());
        ledgerRepository.flush();
        java.time.LocalDate from = YearMonth.parse(p.getStartMonth()).atDay(1);
        java.time.LocalDate to = YearMonth.parse(p.getEndMonth()).atEndOfMonth();
        java.util.Map<Long, java.math.BigDecimal[]> bought = purchaseService.purchaseByItem(from, to);

        // 생산수량과 재료비 · 노무비 · 경비 — 달마다 그 달 실제원가 단가로
        java.util.Map<Long, java.math.BigDecimal[]> made = new java.util.HashMap<>();   // qty, 재료, 노무, 경비
        for (String m : months(p)) {
            java.util.Map<Long, ItemCost> costOf = new java.util.HashMap<>();
            for (ItemCost c : itemCostRepository.findRangeWithItem(m, m)) costOf.put(c.getItem().getId(), c);
            for (var e : costService.producedQty(m).entrySet()) {
                ItemCost c = costOf.get(e.getKey());
                java.math.BigDecimal q = e.getValue();
                java.math.BigDecimal[] acc = made.computeIfAbsent(e.getKey(), k -> new java.math.BigDecimal[]{
                        java.math.BigDecimal.ZERO, java.math.BigDecimal.ZERO, java.math.BigDecimal.ZERO, java.math.BigDecimal.ZERO});
                acc[0] = acc[0].add(q);
                if (c != null) {
                    acc[1] = acc[1].add(won(q.multiply(nz(c.getActualMaterial()))));
                    acc[2] = acc[2].add(won(q.multiply(nz(c.getActualLabor()))));
                    acc[3] = acc[3].add(won(q.multiply(nz(c.getActualOverhead()))));
                }
            }
        }

        java.util.Map<Long, CostLedger> prev = new java.util.HashMap<>();
        previousOf(p).ifPresent(pp -> {
            for (CostLedger l : ledgerRepository.findByPeriodWithItem(pp.getId())) prev.put(l.getItem().getId(), l);
        });
        java.util.Map<Long, java.math.BigDecimal> standard = new java.util.HashMap<>();
        for (ItemCost c : itemCostRepository.findRangeWithItem(p.getStartMonth(), p.getStartMonth())) {
            standard.put(c.getItem().getId(), c.standardTotal());
        }

        for (var r : stockService.movement(from, to, null, false)) {
            java.math.BigDecimal[] b = bought.get(r.itemId());
            java.math.BigDecimal[] mk = made.get(r.itemId());
            boolean any = nz(r.opening()).signum() != 0 || nz(r.inQty()).signum() != 0 || nz(r.outQty()).signum() != 0;
            if (!any) continue;
            CostLedger l = CostLedger.builder()
                    .period(p)
                    .item(itemRef(r.itemId()))
                    .openingQty(nz(r.opening()))
                    .build();
            l.setOpeningAmount(openingAmount(l.getOpeningQty(), prev.get(r.itemId()), standard.get(r.itemId())));
            if (b != null) { l.setPurchaseQty(nz(b[0])); l.setPurchaseAmount(won(nz(b[1]))); }
            if (mk != null) {
                l.setProductionQty(mk[0]);
                l.setProductionAmount(mk[1]);
                l.setLaborAmount(mk[2]);
                l.setOverheadAmount(mk[3]);
            }
            l.setAdjustQty(nz(r.inQty()).subtract(l.getPurchaseQty()).subtract(l.getProductionQty()));
            l.setDecreaseQty(nz(r.outQty()));
            l.recalcTotalAverage();
            ledgerRepository.save(l);
        }
    }

    private com.erp.inventory.item.Item itemRef(Long itemId) {
        return entityManager.getReference(com.erp.inventory.item.Item.class, itemId);
    }

    /** 앞 기간 기말 → 이 기간 기초. 수량이 어긋나면 앞 기간 기말단가로, 앞 기간이 없으면 표준원가로 매긴다. 근거가 없으면 0. */
    private static java.math.BigDecimal openingAmount(java.math.BigDecimal qty, CostLedger prev, java.math.BigDecimal standard) {
        if (qty.signum() == 0) return java.math.BigDecimal.ZERO;
        if (prev != null && prev.getClosingAmount() != null) {
            java.math.BigDecimal pq = prev.closingQty();
            if (pq.compareTo(qty) == 0) return prev.getClosingAmount();
            if (pq.signum() != 0) return won(prev.getClosingAmount().multiply(qty).divide(pq, 6, java.math.RoundingMode.HALF_UP));
        }
        if (standard != null && standard.signum() > 0) return won(standard.multiply(qty));
        return java.math.BigDecimal.ZERO;
    }

    private java.util.Optional<CostPeriod> previousOf(CostPeriod p) {
        String prevEnd = YearMonth.parse(p.getStartMonth()).minusMonths(1).toString();
        return periodRepository.findAll().stream().filter(x -> prevEnd.equals(x.getEndMonth())).findFirst();
    }

    private static java.math.BigDecimal won(java.math.BigDecimal v) {
        return v.setScale(0, java.math.RoundingMode.HALF_UP);
    }

    /**
     * 원가계산 [수정] → 대상(전체 · 선택공정) [적용] 이 여는 원가계산내역. processId 가 있으면 그 공정이 첫 공정인 품목만.
     */
    @Transactional(readOnly = true)
    public com.erp.accounting.cost.dto.CostPeriodDtos.Ledger ledger(Long id, Long processId) {
        CostPeriod p = latest(id);
        java.util.Map<Long, Object[]> proc = borService.firstProcessByProduct();
        List<com.erp.accounting.cost.dto.CostPeriodDtos.LedgerRow> rows = new ArrayList<>();
        for (CostLedger l : scope(p, processId, proc)) {
            var it = l.getItem();
            Object[] pr = proc.get(it.getId());
            rows.add(new com.erp.accounting.cost.dto.CostPeriodDtos.LedgerRow(
                    it.getId(), it.getCode(), it.getName(), it.getSpec(),
                    it.getCategory() != null ? it.getCategory().getDisplayName() : null,
                    pr != null ? (String) pr[1] : null,
                    l.getOpeningQty(), l.getOpeningAmount(), l.increaseQty(), l.increaseAmount(),
                    l.getDecreaseQty(), l.getDecreaseAmount(), l.closingQty(), l.getClosingAmount()));
        }
        return new com.erp.accounting.cost.dto.CostPeriodDtos.Ledger(p.getStartMonth(), p.getEndMonth(), rows);
    }

    /** 원가계산 [기말금액재계산] → 대상 [적용] — 고른 품목의 감소 · 기말 금액을 총평균으로 다시 내고 원가계산내역을 연다. */
    @Transactional
    public com.erp.accounting.cost.dto.CostPeriodDtos.Ledger recalcClosing(Long id, Long processId) {
        CostPeriod p = latest(id);
        requireGenerated(p);
        for (CostLedger l : scope(p, processId, borService.firstProcessByProduct())) l.recalcTotalAverage();
        ledgerRepository.flush();
        return ledger(id, processId);
    }

    /** 체크 → [변경] 원가수정 창. */
    @Transactional(readOnly = true)
    public com.erp.accounting.cost.dto.CostPeriodDtos.LedgerDetail ledgerDetail(Long id, Long itemId) {
        return detail(ledgerRow(latest(id), itemId));
    }

    /**
     * 원가수정 [저장(F8)] — 흰 칸만 받는다(단가는 그 줄 수량 × 단가로 금액이 된다). 감소 · 기말은 '자동계산' 으로 비운다 —
     * 원본도 값을 고치면 감소 · 기말 단가 · 금액 칸이 '자동계산' 으로 바뀌고 [기말금액재계산] 이 다시 낸다.
     */
    @Transactional
    public com.erp.accounting.cost.dto.CostPeriodDtos.LedgerDetail updateLedger(
            Long id, Long itemId, com.erp.accounting.cost.dto.CostPeriodDtos.UpdateLedgerRequest req) {
        CostLedger l = ledgerRow(latest(id), itemId);
        if (req.openingQty() != null) l.setOpeningQty(req.openingQty());
        if (req.openingPrice() != null) l.setOpeningAmount(won(l.getOpeningQty().multiply(req.openingPrice())));
        if (req.productionPrice() != null) l.setProductionAmount(won(l.getProductionQty().multiply(req.productionPrice())));
        if (req.laborAmount() != null) l.setLaborAmount(won(req.laborAmount()));
        if (req.overheadAmount() != null) l.setOverheadAmount(won(req.overheadAmount()));
        if (req.outsourcingPrice() != null) l.setOutsourcingAmount(won(l.getOutsourcingQty().multiply(req.outsourcingPrice())));
        if (req.adjustPrice() != null) l.setAdjustAmount(won(l.getAdjustQty().multiply(req.adjustPrice())));
        l.markDirty();
        return detail(l);
    }

    /** 원가수정 [삭제] — 그 품목 줄을 원가계산내역에서 뺀다. */
    @Transactional
    public void deleteLedger(Long id, Long itemId) {
        ledgerRepository.delete(ledgerRow(latest(id), itemId));
    }

    private CostLedger ledgerRow(CostPeriod p, Long itemId) {
        requireGenerated(p);
        return ledgerRepository.findByPeriod_IdAndItem_Id(p.getId(), itemId)
                .orElseThrow(() -> ApiException.notFound("원가계산내역에 없는 품목입니다. itemId=" + itemId));
    }

    private static void requireGenerated(CostPeriod p) {
        if (!p.isGenerated()) throw ApiException.badRequest("원가계산 [생성] 을 먼저 하세요.");
    }

    private List<CostLedger> scope(CostPeriod p, Long processId, java.util.Map<Long, Object[]> proc) {
        List<CostLedger> all = ledgerRepository.findByPeriodWithItem(p.getId());
        if (processId == null) return all;
        return all.stream().filter(l -> {
            Object[] pr = proc.get(l.getItem().getId());
            return pr != null && processId.equals(pr[0]);
        }).toList();
    }

    private static com.erp.accounting.cost.dto.CostPeriodDtos.LedgerDetail detail(CostLedger l) {
        var it = l.getItem();
        return new com.erp.accounting.cost.dto.CostPeriodDtos.LedgerDetail(it.getId(), it.getCode(), it.getName(),
                l.getOpeningQty(), l.getOpeningAmount(), l.getPurchaseQty(), l.getPurchaseAmount(),
                l.getProductionQty(), l.getProductionAmount(), l.getLaborAmount(), l.getOverheadAmount(),
                l.getOutsourcingQty(), l.getOutsourcingAmount(), l.getAdjustQty(), l.getAdjustAmount(),
                l.getDecreaseQty(), l.getDecreaseAmount(), l.closingQty(), l.getClosingAmount());
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
