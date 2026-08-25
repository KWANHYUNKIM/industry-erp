package com.erp.trade.repository;

import com.erp.trade.domain.MallOrder;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface MallOrderRepository extends JpaRepository<MallOrder, Long> {

    boolean existsByMallAndMallOrderNo(String mall, String mallOrderNo);

    /** 이 판매전표가 쇼핑몰 주문에서 전환된 것인지 (전환된 전표는 수정·삭제를 막는다) */
    boolean existsBySales_Id(Long salesId);

    /** 목록에서 품목명·판매전표번호를 함께 쓰므로 fetch join 한다 (N+1 방지). */
    @Query("select o from MallOrder o left join fetch o.item left join fetch o.sales "
            + "order by o.orderDate desc, o.id desc")
    List<MallOrder> findAllWithRefs();
}
