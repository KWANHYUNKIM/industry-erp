package com.erp.accounting.service;

import com.erp.common.ApiException;
import com.erp.inventory.domain.Item;
import com.erp.accounting.domain.ItemCost;
import com.erp.accounting.dto.CostDtos.CostResponse;
import com.erp.accounting.dto.CostDtos.CreateCostRequest;
import com.erp.accounting.dto.CostDtos.UpdateCostRequest;
import com.erp.accounting.repository.ItemCostRepository;
import com.erp.inventory.repository.ItemRepository;
import com.erp.production.dto.BomDtos.BomLineResponse;
import com.erp.production.dto.BomDtos.BomResponse;
import com.erp.production.service.BomService;
import com.erp.accounting.repository.ProcessExpenseRepository;
import com.erp.accounting.domain.ProcessExpense;
import com.erp.production.domain.Production;
import com.erp.production.domain.ProductionMaterial;
import com.erp.production.repository.ProductionRepository;
import com.erp.production.service.BorService;
import com.erp.trade.domain.Purchase;
import com.erp.trade.domain.PurchaseLine;
import com.erp.trade.repository.PurchaseRepository;

import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import com.erp.accounting.dto.CostDtos;

@Service
@RequiredArgsConstructor
public class CostService {

    // 기준단가 → 표준원가 분해 비율 (재료 60% / 노무 25% / 경비 15%)
    /**
     * 예전에는 표준원가를 <b>판매단가 × 고정비율</b>(재료 60% · 노무 25% · 경비 15%)로 지어냈다.
     * 원가를 판매가에서 역산한 셈이라 방향이 거꾸로였다 — 판매가를 올리면 원가가 따라 오르고
     * 이익률은 언제나 40%로 고정된다. 이익현황·차이분석·매출원가가 전부 이 값에 기댔다.
     * 비율 상수는 그래서 지웠다. 재료비는 BOM 으로 계산하고, 노무비·경비는 사람이 넣는다.
     */

    private final ItemCostRepository itemCostRepository;
    private final ItemRepository itemRepository;
    private final BomService bomService;
    private final BorService borService;
    private final ProcessExpenseRepository processExpenseRepository;
    private final ProductionRepository productionRepository;
    private final PurchaseRepository purchaseRepository;

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
        return build(period, null);
    }

    /**
     * @param basis 원본 원가생성/수정의 <b>[계산기준]</b>. 선입선출법 · 총평균법이 있다.
     *              우리는 총평균법(WEIGHTED_AVG)과 최종매입가(LAST_PURCHASE)를 낸다 —
     *              안 주면 예전대로 최종매입가다.
     *
     *              <p>선입선출법은 못 한다. 입고 레이어(어느 입고분이 얼마에 들어와 아직 남았나)를
     *              남기지 않아 계산할 근거가 없다 — 일별재고현황·이익현황에서도 같은 이유로 빠져 있다.
     */
    @Transactional
    public List<CostResponse> build(String period, String basis) {
        if (period == null || period.isBlank()) {
            throw ApiException.badRequest("적용기간(period)을 입력하세요.");
        }
        String p = period.trim();

        Map<Long, BigDecimal> unitCost = "WEIGHTED_AVG".equalsIgnoreCase(basis)
                ? weightedAvgUnitCosts(p) : materialUnitCosts();
        // 제품 → BOM 라인
        Map<Long, List<BomLineResponse>> bomOf = new HashMap<>();
        for (BomResponse b : bomService.findAll()) {
            if (b.active()) bomOf.put(b.productId(), b.lines());
        }

        List<CostResponse> created = new ArrayList<>();
        for (Item item : itemRepository.findAll()) {
            if (!item.isActive()) continue;
            if (itemCostRepository.existsByItemIdAndPeriod(item.getId(), p)) continue;

            BigDecimal mat = standardMaterialCost(item, bomOf.get(item.getId()), unitCost);
            if (mat == null) continue;   // 자재 단가를 하나도 모르면 지어내지 않는다

            /*
             * 표준노무비 = BOR(작업 라우팅)의 1개당 시간 × 그 공정의 시간당 비용.
             * 라우팅이 없는 품목은 0 이다 — 사 오는 품목에는 노무비가 없고,
             * 라우팅을 아직 안 세운 제조품이라면 세우는 순간 잡힌다.
             */
            BigDecimal lab = borService.standardLaborCost(item.getId());
            if (lab == null) lab = BigDecimal.ZERO;

            ItemCost c = ItemCost.builder()
                    .item(item)
                    .period(p)
                    .materialCost(mat)
                    /*
                     * 노무비·경비는 <b>0 으로 두고 사람이 넣는다.</b>
                     * 원본(이카운트)도 원가계산 전 [노무비/경비등록] 이라는 사전작업 화면에서
                     * 공정·창고별로 직접 넣게 돼 있다(사본의 열: 공정명·창고코드·창고명·노무비·경비).
                     * 우리에겐 품목→공정 라우팅이 없어 배부할 근거가 없다. 지어낸 숫자보다 0 이 낫다.
                     */
                    .laborCost(lab)
                    /*
                     * 경비는 아직 0 이다. 원본은 [노무비/경비등록] 에서 <b>월별 총액</b>을 넣고
                     * 배부하는데(사본 열: 공정명·창고코드·창고명·노무비·경비), 우리에겐 그 총액을
                     * 넣을 자리가 없다. 시간당 비용이 있는 노무비와 달리 경비는 요율이 없어
                     * 지어낼 근거가 전혀 없다.
                     */
                    .overheadCost(BigDecimal.ZERO)
                    .actualMaterial(mat)
                    /*
                     * <b>실제노무비</b>. 예전에는 표준과 같게 깔아 두고 "실적이 들어오면 사람이
                     * 고친다" 고 적어 뒀는데, 고칠 근거가 화면 어디에도 없었다 — 생산입고에
                     * 노무시간을 적을 칸이 없었기 때문이다. 그래서 차이분석이 늘 0 이었다.
                     *
                     * <p>이제 생산입고의 [노무시간]으로 낸다:
                     *   실제노무비 = (그 달 노무시간 합 / 그 달 생산수량 합) × 시간당요율
                     * <b>요율은 표준과 같은 것을 쓴다.</b> 시간만 실제로 바꾼다 — 요율까지
                     * 지어내면 차이가 무엇 때문에 났는지 알 수 없게 된다.
                     *
                     * <p>노무시간을 하나도 안 적은 품목은 <b>표준 그대로</b> 둔다.
                     * 0 으로 두면 "노무비가 안 들었다" 로 읽혀 원가가 통째로 낮아진다.
                     */
                    .actualLabor(actualLabor(item.getId(), p, lab))
                    .actualOverhead(BigDecimal.ZERO)
                    .build();
            created.add(CostResponse.from(itemCostRepository.save(c)));
        }
        return created;
    }

    /**
     * 생산입고에 적힌 <b>실제 노무시간</b>으로 낸 1개당 노무비.
     *
     * <p>노무시간을 하나도 안 적었거나 그 달 생산이 없으면 <b>표준값을 그대로</b> 돌려준다 —
     * 0 을 돌려주면 원가가 통째로 낮아지고, 그게 이익으로 둔갑한다.
     */
    private BigDecimal actualLabor(Long itemId, String period, BigDecimal standard) {
        BigDecimal minutes = BigDecimal.ZERO;
        BigDecimal qty = BigDecimal.ZERO;
        for (Production pr : productionRepository.findAllWithRefs()) {
            if (pr.getProductionDate() == null
                    || !pr.getProductionDate().toString().startsWith(period)) continue;
            if (!pr.getProduct().getId().equals(itemId)) continue;
            if (pr.getLaborMinutes() == null) continue;
            minutes = minutes.add(BigDecimal.valueOf(pr.getLaborMinutes()));
            qty = qty.add(pr.getProducedQty());
        }
        if (minutes.signum() <= 0 || qty.signum() <= 0) return standard;

        BigDecimal rate = borService.hourlyRate(itemId);
        if (rate == null || rate.signum() <= 0) return standard;

        // 분 → 시간, 1개당으로 나눈 뒤 요율을 곱한다.
        BigDecimal hoursPerUnit = minutes
                .divide(BigDecimal.valueOf(60), 6, java.math.RoundingMode.HALF_UP)
                .divide(qty, 6, java.math.RoundingMode.HALF_UP);
        return hoursPerUnit.multiply(rate).setScale(2, java.math.RoundingMode.HALF_UP);
    }

    /**
     * 표준재료비.
     *
     * <p>BOM 이 있으면 <b>자재 소요량 × 자재 단가</b>의 합이다(제조품).
     * BOM 이 없으면 그 품목을 사 오는 것이므로 <b>자기 구매단가</b>가 곧 재료비다.
     *
     * <p>단가를 하나도 모르면 null 을 돌려준다 — 부르는 쪽이 그 품목을 건너뛴다.
     * 0 원짜리 표준원가를 만들어 두면 이익현황이 매출총이익을 100% 로 보여 준다.
     */
    private BigDecimal standardMaterialCost(Item item, List<BomLineResponse> lines,
                                            Map<Long, BigDecimal> unitCost) {
        if (lines == null || lines.isEmpty()) {
            BigDecimal own = unitCost.get(item.getId());
            return own != null && own.signum() > 0 ? scale(own) : null;
        }
        BigDecimal sum = BigDecimal.ZERO;
        boolean any = false;
        for (BomLineResponse l : lines) {
            BigDecimal price = unitCost.get(l.componentId());
            if (price == null || price.signum() <= 0) continue;   // 모르는 자재는 빼고 센다
            sum = sum.add(price.multiply(l.quantity()));
            any = true;
        }
        return any ? scale(sum) : null;
    }

    /** 품목별 자재 단가: 마지막 매입단가가 있으면 그것, 없으면 품목의 구매단가. */
    /**
     * <b>총평균법</b> 자재 단가 — 그 달에 사 온 것의 (금액 합 ÷ 수량 합).
     *
     * <p>최종매입가는 마지막 한 번의 거래에 휘둘린다. 같은 자재를 100개는 1,000원에,
     * 마지막 1개만 5,000원에 샀다면 표준원가가 5배로 뛴다. 총평균은 그 달 전체를 본다.
     *
     * <p>그 달에 매입이 없는 자재는 <b>최종매입가 규칙으로 되돌아간다.</b>
     * 안 사 왔다고 원가를 0 으로 두면 그 품목의 표준원가가 통째로 비어 버린다.
     */
    private Map<Long, BigDecimal> weightedAvgUnitCosts(String period) {
        Map<Long, BigDecimal> amount = new HashMap<>();
        Map<Long, BigDecimal> qty = new HashMap<>();
        for (Purchase pu : purchaseRepository.findAllWithRefs()) {
            if (pu.getPurchaseDate() == null
                    || !pu.getPurchaseDate().toString().startsWith(period)) continue;
            for (PurchaseLine l : pu.getLines()) {
                Long id = l.getItem().getId();
                amount.merge(id, l.getUnitPrice().multiply(l.getQuantity()), BigDecimal::add);
                qty.merge(id, l.getQuantity(), BigDecimal::add);
            }
        }
        Map<Long, BigDecimal> fallback = materialUnitCosts();
        Map<Long, BigDecimal> out = new HashMap<>(fallback);
        for (Map.Entry<Long, BigDecimal> e : qty.entrySet()) {
            BigDecimal q = e.getValue();
            if (q.signum() <= 0) continue;
            BigDecimal avg = amount.get(e.getKey()).divide(q, 2, java.math.RoundingMode.HALF_UP);
            if (avg.signum() > 0) out.put(e.getKey(), avg);
        }
        return out;
    }

    private Map<Long, BigDecimal> materialUnitCosts() {
        Map<Long, LocalDate> lastDate = new HashMap<>();
        Map<Long, BigDecimal> lastPrice = new HashMap<>();
        for (Purchase pu : purchaseRepository.findAllWithRefs()) {
            for (PurchaseLine l : pu.getLines()) {
                Long id = l.getItem().getId();
                LocalDate d = pu.getPurchaseDate();
                if (lastDate.get(id) == null || !d.isBefore(lastDate.get(id))) {
                    lastDate.put(id, d);
                    lastPrice.put(id, l.getUnitPrice());
                }
            }
        }
        Map<Long, BigDecimal> out = new HashMap<>();
        for (Item it : itemRepository.findAll()) {
            BigDecimal last = lastPrice.get(it.getId());
            if (last != null && last.signum() > 0) {
                out.put(it.getId(), last);
            } else if (it.getPurchasePrice() != null && it.getPurchasePrice().signum() > 0) {
                out.put(it.getId(), it.getPurchasePrice());
            }
        }
        return out;
    }

    /**
     * <b>실제원가 계산</b> — 그 달에 정말 얼마가 들었나.
     *
     * <p>원본(이카운트)도 [표준원가생성] 과 [생성](원가계산)이 다른 버튼이다.
     * 표준은 BOM·BOR 대로 "들었어야 할" 값이고, 실제는 그 달 생산실적과
     * 노무비/경비등록에 적힌 실제 발생액에서 나온다.
     *
     * <ul>
     *   <li>실제재료비 = 그 달 그 품목 생산에 <b>정말 투입한 자재 금액</b> ÷ 생산수량</li>
     *   <li>실제노무비·경비 = 노무비/경비등록의 공정별 총액을 <b>표준 작업시간 비율</b>로
     *       배부한 뒤 ÷ 생산수량</li>
     * </ul>
     *
     * <p>배부 기준이 표준시간인 이유: 그 달 실제 작업시간은 작업내역이 있는 작업지시에만
     * 있어서, 작업내역을 안 적은 생산은 배부에서 통째로 빠진다. 그러면 남은 품목이 경비를
     * 다 뒤집어쓴다. BOR × 생산수량은 생산한 모든 품목에 있다.
     *
     * <p>그 달 생산이 없으면 배부율을 낼 수 없다 — 그 공정 경비는 어디에도 안 붙는다.
     * 없는 근거로 아무 품목에나 얹지 않는다.
     *
     * @return 값이 바뀐 원가 행들
     */
    @Transactional
    public List<CostResponse> calcActual(String period) {
        if (period == null || period.isBlank()) {
            throw ApiException.badRequest("기준년월(period)을 입력하세요.");
        }
        String p = period.trim();

        // 1) 그 달 생산실적을 품목별로 모은다: 생산수량과 실제 투입 자재 금액
        Map<Long, BigDecimal> producedQty = new HashMap<>();
        Map<Long, BigDecimal> materialAmount = new HashMap<>();
        Map<Long, BigDecimal> unitCost = materialUnitCosts();
        for (Production pr : productionRepository.findAll()) {
            if (!p.equals(pr.getProductionDate().toString().substring(0, 7))) continue;
            Long pid = pr.getProduct().getId();
            producedQty.merge(pid, pr.getProducedQty(), BigDecimal::add);
            for (ProductionMaterial m : pr.getMaterials()) {
                BigDecimal price = unitCost.get(m.getComponent().getId());
                if (price == null) continue;   // 단가를 모르는 자재는 빼고 센다
                materialAmount.merge(pid, price.multiply(m.getQuantity()), BigDecimal::add);
            }
        }

        // 2) 공정별 총액과, 그 공정에 걸린 총 표준시간
        Map<Long, BigDecimal> laborByProcess = new HashMap<>();
        Map<Long, BigDecimal> overheadByProcess = new HashMap<>();
        for (ProcessExpense e : processExpenseRepository.findByPeriodWithRefs(p)) {
            laborByProcess.merge(e.getProcess().getId(), e.getLaborCost(), BigDecimal::add);
            overheadByProcess.merge(e.getProcess().getId(), e.getOverheadCost(), BigDecimal::add);
        }
        Map<Long, Map<Long, BigDecimal>> hoursOf = new HashMap<>();   // 품목 → 공정 → 1개당 시간
        Map<Long, BigDecimal> totalHoursByProcess = new HashMap<>();
        for (Map.Entry<Long, BigDecimal> e : producedQty.entrySet()) {
            Map<Long, BigDecimal> perProcess = borService.hoursPerUnitByProcess(e.getKey());
            hoursOf.put(e.getKey(), perProcess);
            for (Map.Entry<Long, BigDecimal> h : perProcess.entrySet()) {
                totalHoursByProcess.merge(h.getKey(), h.getValue().multiply(e.getValue()), BigDecimal::add);
            }
        }

        // 3) 품목별로 실제원가를 채운다
        List<CostResponse> updated = new ArrayList<>();
        for (Map.Entry<Long, BigDecimal> e : producedQty.entrySet()) {
            Long itemId = e.getKey();
            BigDecimal qty = e.getValue();
            if (qty.signum() <= 0) continue;

            ItemCost cost = itemCostRepository.findByItemIdAndPeriod(itemId, p).orElse(null);
            if (cost == null) continue;   // 표준원가를 먼저 만들어야 한다

            BigDecimal mat = materialAmount.getOrDefault(itemId, BigDecimal.ZERO)
                    .divide(qty, 2, RoundingMode.HALF_UP);

            BigDecimal lab = BigDecimal.ZERO;
            BigDecimal oh = BigDecimal.ZERO;
            for (Map.Entry<Long, BigDecimal> h : hoursOf.getOrDefault(itemId, Map.of()).entrySet()) {
                BigDecimal total = totalHoursByProcess.get(h.getKey());
                if (total == null || total.signum() == 0) continue;
                BigDecimal share = h.getValue().multiply(qty).divide(total, 8, RoundingMode.HALF_UP);
                lab = lab.add(laborByProcess.getOrDefault(h.getKey(), BigDecimal.ZERO).multiply(share));
                oh = oh.add(overheadByProcess.getOrDefault(h.getKey(), BigDecimal.ZERO).multiply(share));
            }

            cost.setActualMaterial(mat);
            cost.setActualLabor(lab.divide(qty, 2, RoundingMode.HALF_UP));
            cost.setActualOverhead(oh.divide(qty, 2, RoundingMode.HALF_UP));
            updated.add(CostResponse.from(cost));
        }
        return updated;
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
