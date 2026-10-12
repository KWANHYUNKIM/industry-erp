package com.erp.accounting.cost;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface ItemCostRepository extends JpaRepository<ItemCost, Long> {

    @Query("select c from ItemCost c join fetch c.item " +
            "where (:period is null or c.period = :period) " +
            "order by c.period desc, c.item.code")
    List<ItemCost> findAllWithItem(@Param("period") String period);

    boolean existsByItemIdAndPeriod(Long itemId, String period);

    Optional<ItemCost> findByItemIdAndPeriod(Long itemId, String period);

    /** 원가생성/수정 [삭제] — 그 기간에 잡은 원가를 지운다. 기간은 yyyy-MM 이라 글자 차례가 곧 달 차례다. */
    @Modifying
    @Query("delete from ItemCost c where c.period >= :from and c.period <= :to")
    int deleteByPeriodRange(@Param("from") String from, @Param("to") String to);
}
