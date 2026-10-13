package com.erp.trade.orderrelease;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;

public interface OrderReleaseRepository extends JpaRepository<OrderRelease, Long> {

    /** 처리 탭 — 출고일자 기간. 최근 것이 위. */
    @Query("select distinct r from OrderRelease r " +
            "join fetch r.salesOrder o join fetch o.partner " +
            "left join fetch r.sale " +
            "where r.releaseDate between :from and :to " +
            "order by r.releaseDate desc, r.releaseNo desc")
    List<OrderRelease> findInPeriod(@Param("from") LocalDate from, @Param("to") LocalDate to);

    @Query("select r from OrderRelease r join fetch r.salesOrder o join fetch o.partner where r.id = :id")
    Optional<OrderRelease> findWithOrder(@Param("id") Long id);

    /** 주문 줄마다 이미 출고처리한 수량 — [object[]{lineId, sum}]. */
    @Query("select l.salesOrderLine.id, sum(l.quantity) from OrderReleaseLine l " +
            "where l.salesOrderLine.id in :lineIds group by l.salesOrderLine.id")
    List<Object[]> sumReleasedByLine(@Param("lineIds") Collection<Long> lineIds);
}
