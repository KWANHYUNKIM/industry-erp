package com.erp.trade.ordertype;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface OrderNumberRepository extends JpaRepository<OrderNumber, Long> {

    @Query("select o from OrderNumber o join fetch o.orderType order by o.createdDate desc, o.id desc")
    List<OrderNumber> findAllWithType();

    /** 다섯 자리 번호만 — 손으로 넣은 00023_202610 같은 번호는 차례에 끼지 않는다. */
    @Query("select o.orderNo from OrderNumber o where length(o.orderNo) = 5")
    List<String> findPlainNos();

    boolean existsByOrderNo(String orderNo);

    boolean existsByOrderType_Id(Long orderTypeId);
}
