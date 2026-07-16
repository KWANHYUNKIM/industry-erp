package com.erp.trade.repository;

import com.erp.trade.domain.MallOrder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface MallOrderRepository extends JpaRepository<MallOrder, Long> {

    boolean existsByMallAndMallOrderNo(String mall, String mallOrderNo);

    /** 목록에서 품목명·판매전표번호를 함께 쓰므로 fetch join 한다 (N+1 방지). */
    @Query("select o from MallOrder o left join fetch o.item left join fetch o.sales "
            + "order by o.orderDate desc, o.id desc")
    List<MallOrder> findAllWithRefs();
}
