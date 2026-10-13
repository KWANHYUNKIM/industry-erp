package com.erp.trade.price;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SpecialPriceRepository extends JpaRepository<SpecialPrice, Long> {

    @Query("select sp from SpecialPrice sp join fetch sp.group join fetch sp.item i left join fetch i.itemGroup " +
            "order by i.code asc, sp.group.code asc")
    List<SpecialPrice> findAllWithRefs();

    boolean existsByGroupIdAndItemId(Long groupId, Long itemId);

    boolean existsByGroupId(Long groupId);

    @Query("select sp from SpecialPrice sp where sp.group.id = :groupId and sp.item.id = :itemId and sp.active = true")
    Optional<SpecialPrice> findActive(@Param("groupId") Long groupId, @Param("itemId") Long itemId);
}
