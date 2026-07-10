package com.erp.repository;

import com.erp.domain.ShipmentLine;
import com.erp.domain.ShipmentStatus;
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
}
