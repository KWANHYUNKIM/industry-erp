package com.erp.trade.repository;

import com.erp.trade.domain.SalesLine;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;

public interface SalesLineRepository extends JpaRepository<SalesLine, Long> {

    /** 품목별 판매수량·매출액(공급가) 집계 */
    @Query("select l.item.id as itemId, coalesce(sum(l.quantity),0) as qty, " +
            "coalesce(sum(l.supplyAmount),0) as amount " +
            "from SalesLine l group by l.item.id")
    List<ItemAggregate> aggregateByItem();

    /**
     * 미판매현황: 근거전표(수주)별·품목별 판매 전환수량.
     * 판매 라인은 수주 <b>헤더</b>만 가리키므로(sourceOrder) 라인 대 라인이 아니라 품목으로 맞춘다.
     */
    @Query("select l.sourceOrder.id as orderId, l.item.id as itemId, coalesce(sum(l.quantity),0) as qty " +
            "from SalesLine l where l.sourceOrder is not null group by l.sourceOrder.id, l.item.id")
    List<OrderItemAggregate> aggregateSoldByOrderAndItem();

    /**
     * 한 수주의 품목별 판매 전환수량 — 판매 저장 시 <b>주문수량을 넘지 않는지</b> 볼 때 쓴다.
     *
     * <p>{@code excludeSalesId} 는 수정 중인 판매전표를 제외하기 위한 것이다.
     * 그걸 빼지 않으면 자기 수량을 두 번 세어 멀쩡한 수정이 거부된다.
     */
    @Query("select l.sourceOrder.id as orderId, l.item.id as itemId, coalesce(sum(l.quantity),0) as qty " +
            "from SalesLine l where l.sourceOrder.id = :orderId " +
            "and (:excludeSalesId is null or l.sales.id <> :excludeSalesId) " +
            "group by l.sourceOrder.id, l.item.id")
    List<OrderItemAggregate> aggregateSoldByOrder(@Param("orderId") Long orderId,
                                                  @Param("excludeSalesId") Long excludeSalesId);

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

    /** 이 수주를 근거로 만든 판매 라인이 있나. 수주 삭제 가능 여부를 본다. */
    boolean existsBySourceOrderId(Long sourceOrderId);
}
