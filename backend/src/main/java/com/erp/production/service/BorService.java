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
    private final ItemService itemService;

    @Transactional(readOnly = true)
    public List<BorResponse> findAll() {
        return borRepository.findAllWithRefs().stream().map(BorResponse::from).toList();
    }

    @Transactional
    public BorResponse create(SaveBorRequest req) {
        Item product = itemService.get(req.productId());
        ProductionProcess process = getProcess(req.processId());
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
        o.setProcess(getProcess(req.processId()));
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
