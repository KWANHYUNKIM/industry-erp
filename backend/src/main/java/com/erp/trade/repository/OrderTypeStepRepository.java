package com.erp.trade.repository;

import com.erp.trade.domain.OrderTypeStep;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface OrderTypeStepRepository extends JpaRepository<OrderTypeStep, Long> {

    @Query("select s from OrderTypeStep s join fetch s.stage order by s.orderType.id asc, s.seq asc")
    List<OrderTypeStep> findAllWithStage();

    @Query("select s from OrderTypeStep s join fetch s.stage where s.orderType.id = :typeId order by s.seq asc")
    List<OrderTypeStep> findByTypeWithStage(Long typeId);

    void deleteByOrderType_Id(Long orderTypeId);
}
