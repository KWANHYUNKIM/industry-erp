package com.erp.accounting.cost.cost;

import com.erp.common.ApiException;
import com.erp.inventory.item.Item;
import com.erp.accounting.cost.cost.dto.CostDtos.CostResponse;
import com.erp.accounting.cost.cost.dto.CostDtos.CreateCostRequest;
import com.erp.accounting.cost.cost.dto.CostDtos.UpdateCostRequest;
import com.erp.inventory.item.ItemRepository;
import com.erp.production.bom.dto.BomDtos.BomLineResponse;
import com.erp.production.bom.dto.BomDtos.BomResponse;
import com.erp.production.bom.BomService;
import com.erp.accounting.cost.processexpense.ProcessExpenseRepository;
import com.erp.accounting.cost.processexpense.ProcessExpense;
import com.erp.production.production.Production;
import com.erp.production.production.ProductionMaterial;
import com.erp.production.production.ProductionRepository;
import com.erp.production.bor.BorService;
import com.erp.trade.purchase.PurchaseRepository;

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
import com.erp.accounting.cost.cost.dto.CostDtos;

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
    private final com.erp.inventory.item.ItemService itemService;

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

        Map<Long, BigDecimal[]> laborOf = laborByItem(p);
        List<CostResponse> created = new ArrayList<>();
        for (Item item : itemRepository.findAll()) {
            if (!item.isActive()) continue;
            if (itemCostRepository.existsByItemIdAndPeriod(item.getId(), p)) continue;

            // 품목등록 [원가] 탭에 재료비표준원가를 넣은 품목은 그 값을 쓴다(원본 E040808 은 이 값을 옮긴다).
            if (item.getMaterialStdCost() != null) {
                created.add(CostResponse.from(itemCostRepository.save(fromItemMaster(item, p))));
                continue;
            }
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
                    .actualLabor(actualLabor(item.getId(), laborOf, lab))
                    .actualOverhead(BigDecimal.ZERO)
                    .build();
            created.add(CostResponse.from(itemCostRepository.save(c)));
        }
        return created;
    }

    /**
     * 원가생성/수정 [표준원가생성] — 원본 E040802 · E040808(2026-10-20 loginaa 실측).
     *
     * <p>확인 창: '기존에 생성된 내역이 있다면 생성내역이 모두 사라지고 새롭게 계산됩니다. / 표준원가는 재고1 &gt; 기초등록 &gt;
     * 품목등록 &gt; 원가 탭에서 입력할 수 있습니다.' 그대로 — 표준원가 = <b>품목등록 원가 탭 값</b>
     * (재료비표준원가 · 노무비표준원가 · 경비표준원가), 다시 만들면 <b>덮어쓴다</b>.
     * 실측: 밀키스(L003, 상품) 재료비표준원가 500 → 표준원가현황 단가 500, 그 세트(L006 밀키스 1box = 12개) 6,000(= 12 × 500).
     * 재고가 한 번도 움직이지 않은 새 품목(재료비표준원가 500)은 단가0포함을 켜도 줄이 없었다 — 그래서
     * 줄은 그 기간에 재고 기록이 있는 품목({@code itemIds})에만 만든다. 세트 품목은 BOM 구성품 표준원가 × 수량의 합이다.
     */
    @Transactional
    public List<CostResponse> buildStandard(String period, java.util.Collection<Long> itemIds) {
        String p = period.trim();
        Map<Long, List<BomLineResponse>> bomOf = new HashMap<>();
        for (BomResponse b : bomService.findAll()) {
            if (b.active() && (b.defaultVersion() || !bomOf.containsKey(b.productId()))) bomOf.put(b.productId(), b.lines());
        }
        Map<Long, ItemCost> existing = new HashMap<>();
        for (ItemCost c : itemCostRepository.findRangeWithItem(p, p)) existing.put(c.getItem().getId(), c);

        List<CostResponse> out = new ArrayList<>();
        for (Long id : itemIds) {
            Item item = itemService.get(id);
            BigDecimal[] std = masterStandard(item, bomOf);
            ItemCost c = existing.get(id);
            if (c == null) {
                c = ItemCost.builder().item(item).period(p).build();
            }
            c.setMaterialCost(std[0]);
            c.setLaborCost(std[1]);
            c.setOverheadCost(std[2]);
            out.add(CostResponse.from(itemCostRepository.save(c)));
        }
        return out;
    }

    /** 품목 원가 탭의 [재료비 · 노무비 · 경비] 표준원가. 세트 품목은 BOM 구성품의 것 × 수량을 더한다. */
    private BigDecimal[] masterStandard(Item item, Map<Long, List<BomLineResponse>> bomOf) {
        List<BomLineResponse> lines = item.isSetItem() ? bomOf.get(item.getId()) : null;
        if (lines == null || lines.isEmpty()) {
            return new BigDecimal[]{scale(nz(item.getMaterialStdCost())), scale(nz(item.getLaborStdCost())),
                    scale(nz(item.getExpenseStdCost()))};
        }
        BigDecimal[] sum = {BigDecimal.ZERO, BigDecimal.ZERO, BigDecimal.ZERO};
        for (BomLineResponse l : lines) {
            Item comp = itemService.get(l.componentId());
            BigDecimal q = nz(l.quantity());
            sum[0] = sum[0].add(nz(comp.getMaterialStdCost()).multiply(q));
            sum[1] = sum[1].add(nz(comp.getLaborStdCost()).multiply(q));
            sum[2] = sum[2].add(nz(comp.getExpenseStdCost()).multiply(q));
        }
        return new BigDecimal[]{scale(sum[0]), scale(sum[1]), scale(sum[2])};
    }

    /** 품목 원가 탭 값으로 만든 표준 = 실제(실적이 들어오면 원가계산 [생성] 이 실제를 다시 낸다). */
    private ItemCost fromItemMaster(Item item, String period) {
        BigDecimal[] std = masterStandard(item, java.util.Collections.emptyMap());
        return ItemCost.builder().item(item).period(period)
                .materialCost(std[0]).laborCost(std[1]).overheadCost(std[2])
                .actualMaterial(std[0]).actualLabor(std[1]).actualOverhead(std[2])
                .build();
    }

    /**
     * 생산입고에 적힌 <b>실제 노무시간</b>으로 낸 1개당 노무비.
     *
     * <p>노무시간을 하나도 안 적었거나 그 달 생산이 없으면 <b>표준값을 그대로</b> 돌려준다 —
     * 0 을 돌려주면 원가가 통째로 낮아지고, 그게 이익으로 둔갑한다.
     */
    private BigDecimal actualLabor(Long itemId, Map<Long, BigDecimal[]> laborOf, BigDecimal standard) {
        BigDecimal[] mq = laborOf.get(itemId);
        if (mq == null) return standard;
        BigDecimal minutes = mq[0];
        BigDecimal qty = mq[1];
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

    /**
     * 그 달 제품별 [노무시간(분) 합, 생산수량 합] — 노무시간을 적은 생산만. {@link #actualLabor} 의 재료.
     *
     * <p>예전에는 품목 하나마다 전 기간 생산실적을 엔티티로 다시 올리고 일자 문자열로 그 달만 남겼다(2026-10-31 DB 로 내림).
     * 더하는 값과 거르는 조건은 그대로다 — BigDecimal 덧셈이라 차례가 바뀌어도 합은 같다.
     */
    private Map<Long, BigDecimal[]> laborByItem(String period) {
        LocalDate[] r = monthRange(period);
        List<Object[]> rows = r != null ? productionRepository.findCostLaborRowsBetween(r[0], r[1])
                : productionRepository.findCostLaborRowsByDatePrefix(period);
        Map<Long, BigDecimal[]> out = new HashMap<>();
        for (Object[] row : rows) {
            if (row[1] == null) continue;   // 노무시간을 안 적은 생산은 빼고 센다
            BigDecimal[] mq = out.computeIfAbsent(((Number) row[0]).longValue(),
                    k -> new BigDecimal[]{BigDecimal.ZERO, BigDecimal.ZERO});
            mq[0] = mq[0].add(BigDecimal.valueOf(((Number) row[1]).intValue()));
            mq[1] = mq[1].add((BigDecimal) row[2]);
        }
        return out;
    }

    /** yyyy-MM 이면 그 달 [1일, 말일], 아니면 null(부르는 쪽이 일자 앞머리 비교로 간다 — 예전 startsWith 그대로). */
    private static LocalDate[] monthRange(String period) {
        if (period == null || !period.matches("\\d{4}-\\d{2}")) return null;
        try {
            java.time.YearMonth ym = java.time.YearMonth.parse(period);
            return new LocalDate[]{ym.atDay(1), ym.atEndOfMonth()};
        } catch (java.time.format.DateTimeParseException e) {
            return null;
        }
    }

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
        // 그 달 구매 줄만 [품목id, 단가, 수량] 으로 DB 에서 받는다(2026-10-31 — 예전엔 전 기간 전표를 올려 자바에서 걸렀다).
        LocalDate[] r = monthRange(period);
        List<Object[]> rows = r != null ? purchaseRepository.findCostLineRowsBetween(r[0], r[1])
                : purchaseRepository.findCostLineRowsByDatePrefix(period);
        for (Object[] row : rows) {
            Long id = ((Number) row[0]).longValue();
            BigDecimal unitPrice = (BigDecimal) row[1];
            BigDecimal q = (BigDecimal) row[2];
            amount.merge(id, unitPrice.multiply(q), BigDecimal::add);
            qty.merge(id, q, BigDecimal::add);
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

    /**
     * 품목별 자재 단가: 마지막 매입단가가 있으면 그것, 없으면 품목의 구매단가.
     *
     * <p>마지막 매입가는 전 기간을 봐야 한다. 그래도 전표 · 줄을 엔티티로 올리지 않고 줄마다 [품목id, 단가, 일자] 세 칸만 받는다
     * (2026-10-31). 차례(전표 최근순, 같은 날이면 뒤에 걸은 것이 이김)는 예전 그대로다.
     */
    private Map<Long, BigDecimal> materialUnitCosts() {
        Map<Long, LocalDate> lastDate = new HashMap<>();
        Map<Long, BigDecimal> lastPrice = new HashMap<>();
        for (Object[] row : purchaseRepository.findCostPriceRowsLatestFirst()) {
            Long id = ((Number) row[0]).longValue();
            LocalDate d = (LocalDate) row[2];
            if (lastDate.get(id) == null || !d.isBefore(lastDate.get(id))) {
                lastDate.put(id, d);
                lastPrice.put(id, (BigDecimal) row[1]);
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
     *   <li>실제노무비·경비 = 노무비/경비등록의 공정별 총액을 <b>적수(생산수량 × 품목 가중치) 비율</b>로
     *       배부한 뒤 ÷ 생산수량</li>
     * </ul>
     *
     * <p>가중치는 품목등록 원가 탭의 [표준노무시간(노무비가중치)] · [경비가중치] 다. 원본(2026-10-21 실측
     * 실제원가현황 노무비배부액 · 경비배부액): C001 포장 180 × 가중치 1 = 적수 180, 공정적수 180, 포장 노무비 700 ·
     * 경비 350 → 금액 700 · 350. 가중치가 0 이면 적수 0 이라 배부되지 않는다(가중치 0 일 때 노무비를 넣고 생성해도
     * 줄이 빈칸이었다). 공정 소속은 BOR 의 공정으로 본다.
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
        for (Production pr : productionsOf(p)) {
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
        Map<Long, java.util.Set<Long>> processesOf = new HashMap<>();   // 품목 → 그 품목이 거치는 공정(BOR)
        Map<Long, BigDecimal[]> weightOf = new HashMap<>();             // 품목 → {노무비가중치, 경비가중치}
        Map<Long, BigDecimal> laborBaseByProcess = new HashMap<>();     // 공정적수(노무비)
        Map<Long, BigDecimal> overheadBaseByProcess = new HashMap<>();  // 공정적수(경비)
        for (Map.Entry<Long, BigDecimal> e : producedQty.entrySet()) {
            java.util.Set<Long> procs = borService.hoursPerUnitByProcess(e.getKey()).keySet();
            processesOf.put(e.getKey(), procs);
            Item it = getItem(e.getKey());
            BigDecimal[] w = {nz(it.getStdLaborHours()), nz(it.getExpenseWeight())};
            weightOf.put(e.getKey(), w);
            for (Long proc : procs) {
                laborBaseByProcess.merge(proc, e.getValue().multiply(w[0]), BigDecimal::add);
                overheadBaseByProcess.merge(proc, e.getValue().multiply(w[1]), BigDecimal::add);
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

            /*
             * <b>근거가 없으면 있던 값을 둔다.</b> 예전에는 그 달 투입 자재의 단가를 하나도 모르거나
             * 그 품목 공정에 노무비/경비등록이 한 줄도 없어도 0 을 써 넣었다 — [생성] 한 번에
             * 실제원가가 0 이 되고 차이분석이 -100%(전부 절감)로 읽혔다. 표준원가생성이
             * "모르면 지어내지 않는다" 로 null 을 돌려 건너뛰는 것과 같은 규칙이다.
             */
            if (materialAmount.containsKey(itemId)) {
                cost.setActualMaterial(materialAmount.get(itemId).divide(qty, 2, RoundingMode.HALF_UP));
            }

            BigDecimal lab = BigDecimal.ZERO;
            BigDecimal oh = BigDecimal.ZERO;
            boolean allocated = false;   // 이 품목 공정 중 노무비/경비등록이 있는 것이 하나라도 있나
            BigDecimal[] w = weightOf.get(itemId);
            for (Long proc : processesOf.getOrDefault(itemId, java.util.Set.of())) {
                if (!laborByProcess.containsKey(proc)) continue;
                allocated = true;
                BigDecimal lb = laborBaseByProcess.get(proc);
                if (lb != null && lb.signum() > 0) {   // 적수 / 공정적수
                    lab = lab.add(laborByProcess.get(proc).multiply(qty.multiply(w[0])).divide(lb, 8, RoundingMode.HALF_UP));
                }
                BigDecimal ob = overheadBaseByProcess.get(proc);
                if (ob != null && ob.signum() > 0) {
                    oh = oh.add(overheadByProcess.getOrDefault(proc, BigDecimal.ZERO).multiply(qty.multiply(w[1])).divide(ob, 8, RoundingMode.HALF_UP));
                }
            }

            if (allocated) {
                cost.setActualLabor(lab.divide(qty, 2, RoundingMode.HALF_UP));
                cost.setActualOverhead(oh.divide(qty, 2, RoundingMode.HALF_UP));
            }
            updated.add(CostResponse.from(cost));
        }
        return updated;
    }

    /** 원가계산내역 [생산입고] 금액 근거 — 그 달(yyyy-MM) 생산품목 → 소모품목 → 소모수량(생산입고 [소모] 줄). */
    @Transactional(readOnly = true)
    public Map<Long, Map<Long, BigDecimal>> consumedByProduct(String period) {
        Map<Long, Map<Long, BigDecimal>> out = new HashMap<>();
        for (Production pr : productionsOf(period)) {
            for (ProductionMaterial m : pr.getMaterials()) {
                if (m.getQuantity() == null) continue;
                out.computeIfAbsent(pr.getProduct().getId(), k -> new HashMap<>())
                        .merge(m.getComponent().getId(), m.getQuantity(), BigDecimal::add);
            }
        }
        return out;
    }

    /** 원가계산내역 [생산입고] — 그 달(yyyy-MM) 품목별 생산수량. */
    @Transactional(readOnly = true)
    public Map<Long, BigDecimal> producedQty(String period) {
        Map<Long, BigDecimal> out = new HashMap<>();
        for (Production pr : productionsOf(period)) {
            out.merge(pr.getProduct().getId(), pr.getProducedQty(), BigDecimal::add);
        }
        return out;
    }

    /**
     * 그 달(yyyy-MM) 생산실적. 예전에는 전 기간을 {@code findAll()} 로 올려 일자 앞 7자로 걸렀다(2026-10-31 DB 로 내림).
     * 앞 7자가 같을 수 있는 것은 yyyy-MM 뿐이라, 그 꼴이 아니면 예전에도 늘 빈 결과였다.
     */
    private List<Production> productionsOf(String period) {
        LocalDate[] r = monthRange(period);
        return r == null ? List.of() : productionRepository.findByProductionDateBetweenOrderById(r[0], r[1]);
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
