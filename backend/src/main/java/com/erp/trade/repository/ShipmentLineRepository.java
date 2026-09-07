package com.erp.trade.repository;

import com.erp.trade.domain.ShipmentLine;
import com.erp.trade.domain.ShipmentStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.Collection;
import java.util.List;

public interface ShipmentLineRepository extends JpaRepository<ShipmentLine, Long> {

    /**
     * 한 주문의 라인별 출하수량 합계를 상태로 걸러 한 번에 집계한다.
     * 반환: [orderLineId, sum(quantity)]
     *
     * - 누적 출하수량   → statuses = [SHIPPED]
     * - 예약(약정) 수량 → statuses = [READY, SHIPPED]  (초과출하 검증용)
     */
    @Query("select sl.orderLine.id, coalesce(sum(sl.quantity), 0) " +
            "from ShipmentLine sl " +
            "where sl.orderLine.salesOrder.id = :orderId " +
            "and sl.shipment.status in :statuses " +
            "group by sl.orderLine.id")
    List<Object[]> sumQuantityByOrderLine(@Param("orderId") Long orderId,
                                          @Param("statuses") Collection<ShipmentStatus> statuses);

    /**
     * 주문 라인별 <b>이미 잡힌</b> 출하수량 — 미출하현황이 쓴다.
     *
     * <p>주문 하나씩이 아니라 한 번에 모은다. 미출하현황은 열려 있는 주문 전부를 훑으므로
     * 주문마다 쿼리를 날리면 N+1 이 된다.
     */
    @Query("select sl.orderLine.id, coalesce(sum(sl.quantity), 0) " +
            "from ShipmentLine sl " +
            "where sl.shipment.status in :statuses " +
            "group by sl.orderLine.id")
    List<Object[]> sumQuantityByOrderLineAll(@Param("statuses") Collection<ShipmentStatus> statuses);

    /**
     * 주문 라인별 <b>이미 나가 있는 출하지시 전표번호</b> — 미출하현황의 [출하지시No.] 조건.
     *
     * <p>우리 출하는 <b>출하지시(READY) → 출하완료(SHIPPED)</b> 두 단계다. 미출하로 남아 있는
     * 줄이라도 지시는 이미 나가 있을 수 있다 — 그게 어느 지시인지 물을 수 있어야
     * "이 지시에 걸린 것들만" 을 뽑는다. 완료된 출하는 안 센다. 그건 이미 나간 것이라
     * 미출하 잔량과 이어지지 않는다.
     *
     * <p>반환: [orderLineId, shipNo]. 한 줄에 지시가 여럿일 수 있어 합치지 않고 그대로 준다.
     */
    @Query("select sl.orderLine.id, sl.shipment.shipNo from ShipmentLine sl " +
            "where sl.shipment.status = :status order by sl.shipment.shipNo")
    List<Object[]> findShipNosByOrderLine(@Param("status") ShipmentStatus status);
}
