package com.erp.trade.repository;

import com.erp.trade.domain.PurchaseOrder;
import com.erp.trade.domain.PurchaseOrderStatus;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface PurchaseOrderRepository extends JpaRepository<PurchaseOrder, Long> {

    @Query("select distinct po from PurchaseOrder po join fetch po.partner " +
            "left join fetch po.employee left join fetch po.warehouse " +
            "left join fetch po.lines l left join fetch l.item left join fetch l.partner " +
            "order by po.orderDate desc, po.id desc")
    List<PurchaseOrder> findAllWithRefs();

    /**
     * 이 구매전표를 만들어 낸 발주서. 입고전환의 역방향이다.
     * 구매전표를 지울 때 발주서의 입고 연결을 풀어 주려고 쓴다.
     */
    Optional<PurchaseOrder> findByConvertedPurchaseId(Long purchaseId);

    @Query("select distinct po from PurchaseOrder po join fetch po.partner " +
            "left join fetch po.employee left join fetch po.warehouse " +
            "left join fetch po.lines l left join fetch l.item left join fetch l.partner " +
            "where po.status = :status " +
            "order by po.orderDate desc, po.id desc")
    List<PurchaseOrder> findByStatusWithRefs(@Param("status") PurchaseOrderStatus status);
}
