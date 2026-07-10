package com.erp.repository;

import com.erp.domain.ItemCost;
import org.springframework.data.jpa.repository.JpaRepository;
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
}
