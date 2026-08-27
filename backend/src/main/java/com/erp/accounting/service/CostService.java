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
        if (period == null || period.isBlank()) {
            throw ApiException.badRequest("적용기간(period)을 입력하세요.");
        }
        String p = period.trim();

        // 자재 단가: 마지막 매입단가 → 품목 구매단가. 재고자산평가와 같은 규칙이다.
        Map<Long, BigDecimal> unitCost = materialUnitCosts();
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
                    // 실제원가 초기값은 표준과 같게 둔다(실적이 들어오면 사람이 고친다). 그때 차이는 0.
                    .actualMaterial(mat)
                    .actualLabor(lab)
                    .actualOverhead(BigDecimal.ZERO)
                    .build();
            created.add(CostResponse.from(itemCostRepository.save(c)));
        }
        return created;
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
