package com.erp.trade.ordertype;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface OrderNumberRepository extends JpaRepository<OrderNumber, Long> {

    @Query("select o from OrderNumber o join fetch o.orderType order by o.createdDate desc, o.id desc")
    List<OrderNumber> findAllWithType();

    @Query("select max(o.orderNo) from OrderNumber o where length(o.orderNo) = 5")
    String findMaxPlainNo();

    boolean existsByOrderType_Id(Long orderTypeId);
}
