package com.erp.trade.repository;

import com.erp.trade.domain.PurchaseOrderHistory;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface PurchaseOrderHistoryRepository extends JpaRepository<PurchaseOrderHistory, Long> {

    /** 한 발주의 자취를 <b>넘어간 차례대로</b>. 같은 시각이면 남긴 차례(id)를 따른다. */
    List<PurchaseOrderHistory> findByOrderIdOrderByChangedAtAscIdAsc(Long orderId);
}
