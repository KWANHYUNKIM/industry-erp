package com.erp.production.service;

import com.erp.common.ApiException;
import com.erp.inventory.domain.Item;
import com.erp.inventory.service.ItemService;
import com.erp.production.domain.BorOperation;
import com.erp.production.domain.ProductionProcess;
import com.erp.production.dto.BorDtos.BorResponse;
import com.erp.production.dto.BorDtos.SaveBorRequest;
import com.erp.production.repository.BorRepository;
import com.erp.production.repository.ProcessRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.List;

/**
 * BOR(작업소요시간) — 품목별 작업 라우팅.
 *
 * <p>BOM 이 "무엇으로 만드는가" 라면 BOR 은 "어떻게 만드는가" 다.
 * 이 표가 있어야 <b>표준 작업시간</b>이 나오고, 그래야 작업지시서효율현황이
 * "이 작업지시가 표준보다 오래 걸렸나" 를 말할 수 있다.
 */
@Service
@RequiredArgsConstructor
public class BorService {

    private final BorRepository borRepository;
    private final ProcessRepository processRepository;
    private final ProcessService processService;
    private final ItemService itemService;

    @Transactional(readOnly = true)
    public List<BorResponse> findAll() {
        return borRepository.findAllWithRefs().stream().map(BorResponse::from).toList();
    }

    @Transactional
    public BorResponse create(SaveBorRequest req) {
        Item product = itemService.get(req.productId());
        // 사용중지한 공정으로 새 작업을 올릴 수는 없다(원본은 코드도움에 띄우지도 않는다).
        ProductionProcess process = processService.getUsable(req.processId());
        requireFreeSeq(req.productId(), req.seq(), null);

        BorOperation o = BorOperation.builder()
                .product(product)
                .process(process)
                .seq(req.seq())
                .workName(req.workName().trim())
                .baseQty(req.baseQty() != null ? req.baseQty() : BigDecimal.ONE)
                .workHours(req.workHours())
                .remark(req.remark())
                .active(req.active() == null || req.active())
                .build();
        return BorResponse.from(borRepository.save(o));
    }

    @Transactional
    public BorResponse update(Long id, SaveBorRequest req) {
        BorOperation o = get(id);
        requireFreeSeq(req.productId(), req.seq(), id);

        o.setProduct(itemService.get(req.productId()));
        o.setProcess(processService.getUsable(req.processId()));
        o.setSeq(req.seq());
        o.setWorkName(req.workName().trim());
        o.setBaseQty(req.baseQty() != null ? req.baseQty() : BigDecimal.ONE);
        o.setWorkHours(req.workHours());
        o.setRemark(req.remark());
        if (req.active() != null) {
            o.setActive(req.active());
        }
        return BorResponse.from(o);
    }

    @Transactional
    public void delete(Long id) {
        borRepository.delete(get(id));
    }

    /**
     * 그 품목을 <b>수량만큼</b> 만들 때의 표준 작업시간(H).
     *
     * <p>작업시간은 '생산수량 기준' 으로 적혀 있다(100개 로트에 3시간처럼).
     * 그래서 1개당으로 환산한 뒤 수량을 곱한다. 라우팅이 없으면 null —
     * 0 을 돌려주면 "표준이 0시간" 과 "표준을 모른다" 가 같은 얼굴이 된다.
     */
    @Transactional(readOnly = true)
    public BigDecimal standardHours(Long productId, BigDecimal qty) {
        List<BorOperation> ops = borRepository.findActiveByProduct(productId);
        if (ops.isEmpty()) return null;
        BigDecimal sum = BigDecimal.ZERO;
        for (BorOperation o : ops) {
            BigDecimal base = o.getBaseQty() == null || o.getBaseQty().signum() == 0
                    ? BigDecimal.ONE : o.getBaseQty();
            sum = sum.add(o.getWorkHours().divide(base, 6, java.math.RoundingMode.HALF_UP).multiply(qty));
        }
        return sum.setScale(3, java.math.RoundingMode.HALF_UP);
    }

    /**
     * 그 품목 <b>1개당 표준노무비</b>. 작업마다 (1개당 시간 × 그 공정의 시간당 비용)을 더한다.
     *
     * <p>공정 마스터가 이미 시간당 비용(costPerHr)을 들고 있어서, 원본처럼 월별 노무비
     * 총액을 넣고 배부하지 않아도 단위 노무비가 나온다. 라우팅이 없으면 null —
     * 0 을 돌려주면 "노무비가 안 드는 품목" 과 "라우팅을 아직 안 세운 품목" 이 같아진다.
     */

    @Transactional(readOnly = true)
    public BigDecimal standardLaborCost(Long productId) {
        List<BorOperation> ops = borRepository.findActiveByProduct(productId);
        if (ops.isEmpty()) return null;
        BigDecimal sum = BigDecimal.ZERO;
        for (BorOperation o : ops) {
            BigDecimal base = o.getBaseQty() == null || o.getBaseQty().signum() == 0
                    ? BigDecimal.ONE : o.getBaseQty();
            BigDecimal hoursPerUnit = o.getWorkHours().divide(base, 6, java.math.RoundingMode.HALF_UP);
            BigDecimal rate = o.getProcess().getCostPerHr() != null
                    ? o.getProcess().getCostPerHr() : BigDecimal.ZERO;
            sum = sum.add(hoursPerUnit.multiply(rate));
        }
        return sum.setScale(2, java.math.RoundingMode.HALF_UP);
    }

    /**
     * 그 품목 라우팅의 <b>시간당 요율</b> — 표준노무비 ÷ 1개당 표준시간.
     *
     * <p>실제노무비를 낼 때 쓴다: 실제시간 × <b>이 요율</b>. 요율을 따로 지어내지 않고
     * 표준과 같은 것을 쓰는 이유는, 요율까지 바꾸면 차이가 시간 때문인지 요율 때문인지
     * 알 수 없게 되기 때문이다.
     *
     * <p>라우팅이 없거나 시간이 0 이면 null 이다 — 나눌 수가 없다.
     */
    @Transactional(readOnly = true)
    public BigDecimal hourlyRate(Long productId) {
        List<BorOperation> ops = borRepository.findActiveByProduct(productId);
        if (ops.isEmpty()) return null;
        BigDecimal hours = BigDecimal.ZERO;
        BigDecimal cost = BigDecimal.ZERO;
        for (BorOperation o : ops) {
            BigDecimal base = o.getBaseQty() == null || o.getBaseQty().signum() == 0
                    ? BigDecimal.ONE : o.getBaseQty();
            BigDecimal hoursPerUnit = o.getWorkHours().divide(base, 6, java.math.RoundingMode.HALF_UP);
            BigDecimal rate = o.getProcess().getCostPerHr() != null
                    ? o.getProcess().getCostPerHr() : BigDecimal.ZERO;
            hours = hours.add(hoursPerUnit);
            cost = cost.add(hoursPerUnit.multiply(rate));
        }
        if (hours.signum() <= 0) return null;
        return cost.divide(hours, 4, java.math.RoundingMode.HALF_UP);
    }

    /**
     * 그 품목을 그 <b>공정</b>에서 수량만큼 작업할 때의 표준시간(분).
     *
     * <p>원본 작업내역현황의 [표준작업시간] 열이다. 실제 작업시간과 나란히 놓고
     * [차이(표준-실제)] 를 본다. 라우팅에 그 공정이 없으면 null 이다 —
     * 0 을 돌려주면 "표준이 0분" 과 "표준을 모른다" 가 같은 얼굴이 되어,
     * 라우팅을 안 세운 품목이 전부 '표준보다 오래 걸림' 으로 보인다.
     */
    @Transactional(readOnly = true)
    public Integer standardMinutes(Long productId, Long processId, BigDecimal qty) {
        if (productId == null || processId == null || qty == null) return null;
        BigDecimal hoursPerUnit = hoursPerUnitByProcess(productId).get(processId);
        if (hoursPerUnit == null) return null;
        return hoursPerUnit.multiply(qty).multiply(BigDecimal.valueOf(60))
                .setScale(0, java.math.RoundingMode.HALF_UP).intValue();
    }

    /**
     * 품목이 <b>공정마다</b> 쓰는 1개당 시간(H). 경비·노무비를 공정별로 배부할 때 쓴다.
     * 라우팅이 없으면 빈 map.
     */
    @Transactional(readOnly = true)
    public java.util.Map<Long, BigDecimal> hoursPerUnitByProcess(Long productId) {
        java.util.Map<Long, BigDecimal> m = new java.util.LinkedHashMap<>();
        for (BorOperation o : borRepository.findActiveByProduct(productId)) {
            BigDecimal base = o.getBaseQty() == null || o.getBaseQty().signum() == 0
                    ? BigDecimal.ONE : o.getBaseQty();
            BigDecimal h = o.getWorkHours().divide(base, 6, java.math.RoundingMode.HALF_UP);
            m.merge(o.getProcess().getId(), h, BigDecimal::add);
        }
        return m;
    }

    private void requireFreeSeq(Long productId, Integer seq, Long excludeId) {
        borRepository.findByProduct_IdAndSeq(productId, seq).ifPresent(found -> {
            if (!found.getId().equals(excludeId)) {
                throw ApiException.badRequest("같은 품목에 작업순서 " + seq + " 이(가) 이미 있습니다.");
            }
        });
    }

    private BorOperation get(Long id) {
        return borRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("작업(BOR)을 찾을 수 없습니다. id=" + id));
    }

    private ProductionProcess getProcess(Long id) {
        return processRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("공정을 찾을 수 없습니다. id=" + id));
    }
}
