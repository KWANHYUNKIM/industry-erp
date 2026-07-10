package com.erp.repository;

import com.erp.domain.WorkOrder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface WorkOrderRepository extends JpaRepository<WorkOrder, Long> {

    @Query("select w from WorkOrder w join fetch w.product join fetch w.warehouse " +
            "order by w.orderDate desc, w.id desc")
    List<WorkOrder> findAllWithRefs();
}
