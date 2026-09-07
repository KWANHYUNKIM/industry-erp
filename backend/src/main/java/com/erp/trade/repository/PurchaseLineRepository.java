package com.erp.trade.repository;

import com.erp.trade.domain.PurchaseLine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;

public interface PurchaseLineRepository extends JpaRepository<PurchaseLine, Long> {

    /** 품목별 매입수량·매입액(공급가) 집계 → 총평균 매입단가 계산에 사용 */
    @Query("select l.item.id as itemId, coalesce(sum(l.quantity),0) as qty, " +
            "coalesce(sum(l.supplyAmount),0) as amount " +
            "from PurchaseLine l group by l.item.id")
    List<ItemAggregate> aggregateByItem();

    /**
     * 한 발주의 품목별 구매 전환수량 — 구매 저장 시 <b>발주수량을 넘지 않는지</b> 볼 때 쓴다.
     * 판매(SalesLineRepository.aggregateSoldByOrder)와 같은 규칙이다.
     *
     * @param excludePurchaseId 수정 중인 구매전표. 빼지 않으면 자기 수량을 두 번 세어
     *                          멀쩡한 수정이 거부된다.
     */
    @Query("select l.sourceOrder.id as orderId, l.item.id as itemId, coalesce(sum(l.quantity),0) as qty " +
            "from PurchaseLine l where l.sourceOrder.id = :orderId " +
            "and (:excludePurchaseId is null or l.purchase.id <> :excludePurchaseId) " +
            "group by l.sourceOrder.id, l.item.id")
    List<OrderItemAggregate> aggregateBoughtByOrder(@Param("orderId") Long orderId,
                                                    @Param("excludePurchaseId") Long excludePurchaseId);

    interface OrderItemAggregate {
        Long getOrderId();
        Long getItemId();
        BigDecimal getQty();
    }

    interface ItemAggregate {
        Long getItemId();
        BigDecimal getQty();
        BigDecimal getAmount();
    }

    /** 이 발주를 근거로 만든 구매 라인이 있나. 발주 삭제 가능 여부를 본다. */
    boolean existsBySourceOrderId(Long sourceOrderId);
}
