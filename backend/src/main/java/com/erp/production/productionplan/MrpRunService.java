package com.erp.production.productionplan;

import com.erp.common.ApiException;
import com.erp.common.DocumentNoGenerator;
import com.erp.inventory.item.ItemService;
import com.erp.production.bom.BomService;
import com.erp.production.productionplan.dto.MrpRunDtos.LineQty;
import com.erp.production.productionplan.dto.MrpRunDtos.LineResponse;
import com.erp.production.productionplan.dto.MrpRunDtos.RunResponse;
import com.erp.production.productionplan.dto.MrpRunDtos.SaveRunRequest;
import com.erp.production.productionplan.dto.MrpRunDtos.UpdateLinesRequest;
import com.erp.production.productionplan.dto.TimePhasedDtos;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.*;

/**
 * 원본 <b>생산계획/MRP리스트</b> — 계산 한 번을 한 줄로 남기고, 그 결과를 저장해 고치고 넘긴다.
 *
 * <p>[생성] 은 {@link TimePhasedPlanService} 로 기간의 날짜별 순소요를 계산해 계획수량이 선 날마다 한 줄을 저장한다.
 * 다시 [생성] 하면 그 갈래(생산계획·MRP)의 줄을 지우고 새로 계산한다 — 원본도 "수정내역이 모두 사라지고 새롭게
 * 계산됩니다" 라고 묻고 그렇게 한다(2026-10-02 loginaa 실측). [수정] 은 계획수량만 고친다.
 */
@Service
@RequiredArgsConstructor
public class MrpRunService {

    private final MrpRunRepository runRepository;
    private final MrpRunLineRepository lineRepository;
    private final TimePhasedPlanService timePhasedPlanService;
    private final BomService bomService;
    /* 다른 모듈은 service 로(CLAUDE.md 4.2). */
    private final ItemService itemService;
    private final DocumentNoGenerator docNoGenerator;
    private final com.erp.inventory.warehouse.WarehouseService warehouseService;

    @Transactional(readOnly = true)
    public List<RunResponse> findAll() {
        Map<String, Object[]> sum = new HashMap<>();
        for (Object[] s : lineRepository.summary()) sum.put(s[0] + "|" + s[1], s);
        return runRepository.findAllWithRefs().stream().map(r -> {
            Object[] p = sum.get(r.getId() + "|" + MrpRunKind.PLAN);
            Object[] m = sum.get(r.getId() + "|" + MrpRunKind.MRP);
            return RunResponse.from(r,
                    p != null ? ((Number) p[2]).longValue() : 0, p != null ? (BigDecimal) p[3] : BigDecimal.ZERO,
                    m != null ? ((Number) m[2]).longValue() : 0, m != null ? (BigDecimal) m[3] : BigDecimal.ZERO);
        }).toList();
    }

    @Transactional
    public RunResponse create(SaveRunRequest req, String username) {
        validate(req);
        LocalDate date = req.runDate() != null ? req.runDate() : LocalDate.now();
        MrpRun run = MrpRun.builder()
                .runNo(docNoGenerator.next("MRP-", "mrp_runs", "run_no", "run_date", date))
                .runDate(date)
                .periodFrom(req.periodFrom())
                .periodTo(req.periodTo())
                .baseItem(req.baseItemId() != null ? itemService.get(req.baseItemId()) : null)
                .note(req.note())
                .createdBy(username)
                .srcUnsold(req.srcUnsold() == null || req.srcUnsold())
                .srcUnpurchased(req.srcUnpurchased() == null || req.srcUnpurchased())
                .srcUnproduced(Boolean.TRUE.equals(req.srcUnproduced()))
                .planSafety(req.planSafety() == null || req.planSafety())
                .planMinUnit(Boolean.TRUE.equals(req.planMinUnit()))
                .mrpSafety(req.mrpSafety() == null || req.mrpSafety())
                .mrpMinUnit(req.mrpMinUnit() == null || req.mrpMinUnit())
                .planLeadTime(req.planLeadTime() == null || req.planLeadTime())
                .mrpLeadTime(req.mrpLeadTime() == null || req.mrpLeadTime())
                .stockWarehouse(req.stockWarehouseId() != null ? warehouseService.get(req.stockWarehouseId()) : null)
                .docWarehouse(req.docWarehouseId() != null ? warehouseService.get(req.docWarehouseId()) : null)
                .build();
        return RunResponse.from(runRepository.save(run), 0, BigDecimal.ZERO, 0, BigDecimal.ZERO);
    }

    /** 머리를 고친다. 기간·기준품목이 바뀌면 저장된 결과는 옛 조건의 것이라 지운다(다시 [생성] 해야 한다). */
    @Transactional
    public void update(Long id, SaveRunRequest req) {
        validate(req);
        MrpRun run = get(id);
        Long oldBase = run.getBaseItem() != null ? run.getBaseItem().getId() : null;
        boolean unsold = req.srcUnsold() == null ? run.isSrcUnsold() : req.srcUnsold();
        boolean unpurchased = req.srcUnpurchased() == null ? run.isSrcUnpurchased() : req.srcUnpurchased();
        boolean unproduced = req.srcUnproduced() == null ? run.isSrcUnproduced() : req.srcUnproduced();
        boolean changed = !run.getPeriodFrom().equals(req.periodFrom()) || !run.getPeriodTo().equals(req.periodTo())
                || !Objects.equals(oldBase, req.baseItemId())
                || unsold != run.isSrcUnsold() || unpurchased != run.isSrcUnpurchased() || unproduced != run.isSrcUnproduced();
        boolean ps = req.planSafety() == null ? run.isPlanSafety() : req.planSafety();
        boolean pm = req.planMinUnit() == null ? run.isPlanMinUnit() : req.planMinUnit();
        boolean ms = req.mrpSafety() == null ? run.isMrpSafety() : req.mrpSafety();
        boolean mm = req.mrpMinUnit() == null ? run.isMrpMinUnit() : req.mrpMinUnit();
        changed = changed || ps != run.isPlanSafety() || pm != run.isPlanMinUnit() || ms != run.isMrpSafety() || mm != run.isMrpMinUnit();
        run.setPlanSafety(ps); run.setPlanMinUnit(pm); run.setMrpSafety(ms); run.setMrpMinUnit(mm);
        Long oldStockWh = run.getStockWarehouse() != null ? run.getStockWarehouse().getId() : null;
        Long oldDocWh = run.getDocWarehouse() != null ? run.getDocWarehouse().getId() : null;
        boolean pl = req.planLeadTime() == null ? run.isPlanLeadTime() : req.planLeadTime();
        boolean ml = req.mrpLeadTime() == null ? run.isMrpLeadTime() : req.mrpLeadTime();
        changed = changed || pl != run.isPlanLeadTime() || ml != run.isMrpLeadTime()
                || !Objects.equals(oldStockWh, req.stockWarehouseId()) || !Objects.equals(oldDocWh, req.docWarehouseId());
        run.setPlanLeadTime(pl); run.setMrpLeadTime(ml);
        run.setStockWarehouse(req.stockWarehouseId() != null ? warehouseService.get(req.stockWarehouseId()) : null);
        run.setDocWarehouse(req.docWarehouseId() != null ? warehouseService.get(req.docWarehouseId()) : null);
        run.setSrcUnsold(unsold);
        run.setSrcUnpurchased(unpurchased);
        run.setSrcUnproduced(unproduced);
        if (req.runDate() != null) run.setRunDate(req.runDate());
        run.setPeriodFrom(req.periodFrom());
        run.setPeriodTo(req.periodTo());
        run.setBaseItem(req.baseItemId() != null ? itemService.get(req.baseItemId()) : null);
        run.setNote(req.note());
        if (changed) {
            for (MrpRunKind k : MrpRunKind.values()) lineRepository.deleteByRun(id, k);
            run.setPlanGeneratedAt(null);
            run.setMrpGeneratedAt(null);
        }
    }

    @Transactional
    public void delete(Long id) {
        MrpRun run = get(id);
        for (MrpRunKind k : MrpRunKind.values()) lineRepository.deleteByRun(id, k);
        runRepository.delete(run);
    }

    /**
     * [생산계획계산 생성] · [MRP계산 생성]. 그 갈래의 줄을 지우고 기간을 새로 계산해 저장한다.
     * 생산계획은 BOM 이 있는 품목, MRP 는 없는 품목(사들이는 자재)이다 — 현황 화면과 같은 기준.
     */
    @Transactional
    public List<LineResponse> generate(Long id, MrpRunKind kind) {
        MrpRun run = get(id);
        TimePhasedDtos.Result res = timePhasedPlanService.compute(run.getPeriodFrom(), run.getPeriodTo(),
                new TimePhasedPlanService.Options(run.isSrcUnsold(), run.isSrcUnpurchased(), run.isSrcUnproduced(),
                        run.isPlanSafety(), run.isPlanMinUnit(), run.isMrpSafety(), run.isMrpMinUnit(),
                        run.getStockWarehouse() != null ? run.getStockWarehouse().getId() : null,
                        run.getDocWarehouse() != null ? run.getDocWarehouse().getId() : null));
        boolean useLead = kind == MrpRunKind.PLAN ? run.isPlanLeadTime() : run.isMrpLeadTime();
        Set<Long> scope = run.getBaseItem() != null ? scopeOf(run.getBaseItem().getId()) : null;

        lineRepository.deleteByRun(id, kind);
        List<MrpRunLine> lines = new ArrayList<>();
        int no = 0;
        for (TimePhasedDtos.Row r : res.rows()) {
            if (r.producible() != (kind == MrpRunKind.PLAN)) continue;
            if (scope != null && !scope.contains(r.itemId())) continue;
            BigDecimal dec = nz(r.before().outQty()).add(nz(r.before().consumeQty()));
            BigDecimal inc = nz(r.before().inQty()).add(nz(r.before().prodQty()));
            for (TimePhasedDtos.Cell c : r.days()) {
                dec = dec.add(nz(c.outQty())).add(nz(c.consumeQty()));
                inc = inc.add(nz(c.inQty())).add(nz(c.prodQty()));
            }
            List<LocalDate> needDates = new ArrayList<>();
            List<BigDecimal> qtys = new ArrayList<>();
            for (int i = 0; i < r.days().size(); i++) {
                BigDecimal p = nz(r.days().get(i).planQty());
                if (p.signum() > 0) { needDates.add(res.days().get(i)); qtys.add(p); }
            }
            // 계획이 없는 품목도 한 줄 — 원본 생산계획리스트도 계획수량이 빈 품목을 보인다.
            if (qtys.isEmpty()) { needDates.add(null); qtys.add(BigDecimal.ZERO); }
            var item = itemService.get(r.itemId());
            for (int k = 0; k < qtys.size(); k++) {
                lines.add(MrpRunLine.builder()
                        .run(run).kind(kind).lineNo(++no).item(item).needDate(needDates.get(k))
                        .prevStock(nz(r.prevStock())).safetyStock(nz(r.safetyStock())).minUnit(nz(r.minUnit()))
                        .leadTimeDays(useLead ? r.leadTimeDays() : Integer.valueOf(0))
                        .decreaseQty(dec).increaseQty(inc)
                        .calcQty(qtys.get(k)).planQty(qtys.get(k))
                        .supplierId(r.supplierId())
                        .build());
            }
        }
        lineRepository.saveAll(lines);
        if (kind == MrpRunKind.PLAN) run.setPlanGeneratedAt(LocalDateTime.now());
        else run.setMrpGeneratedAt(LocalDateTime.now());
        return lines.stream().map(LineResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<LineResponse> lines(Long id, MrpRunKind kind) {
        get(id);
        return lineRepository.findByRun(id, kind).stream().map(LineResponse::from).toList();
    }

    /** 원본 [수정] — 계획수량만 고친다. 다른 계산의 줄은 받지 않는다. */
    @Transactional
    public List<LineResponse> updateLines(Long id, MrpRunKind kind, UpdateLinesRequest req) {
        get(id);
        Map<Long, MrpRunLine> mine = new HashMap<>();
        lineRepository.findByRun(id, kind).forEach(l -> mine.put(l.getId(), l));
        for (LineQty q : req.lines()) {
            MrpRunLine l = mine.get(q.id());
            if (l == null) throw ApiException.badRequest("이 계산의 줄이 아닙니다. id=" + q.id());
            l.setPlanQty(q.planQty());
        }
        return mine.values().stream().sorted(Comparator.comparing(MrpRunLine::getLineNo))
                .map(LineResponse::from).toList();
    }

    private MrpRun get(Long id) {
        return runRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("생산계획/MRP 를 찾을 수 없습니다. id=" + id));
    }

    private static void validate(SaveRunRequest req) {
        if (req.periodTo().isBefore(req.periodFrom())) throw ApiException.badRequest("생산계획기간을 바르게 정하세요.");
    }

    /** 기준품목과 그 BOM 아래 품목들. BOM 이 없는 품목이면 자기 하나다. */
    private Set<Long> scopeOf(Long itemId) {
        Set<Long> s = new HashSet<>();
        s.add(itemId);
        try {
            bomService.forwardTree(itemId, null).forEach(n -> s.add(n.itemId()));
        } catch (ApiException e) {
            // BOM 이 없는 품목 — 자기 하나만.
        }
        return s;
    }

    private static BigDecimal nz(BigDecimal v) { return v == null ? BigDecimal.ZERO : v; }
}
