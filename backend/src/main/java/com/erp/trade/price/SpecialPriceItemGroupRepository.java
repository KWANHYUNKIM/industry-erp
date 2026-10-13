package com.erp.trade.price;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface SpecialPriceItemGroupRepository extends JpaRepository<SpecialPriceItemGroup, Long> {

    @Query("select g from SpecialPriceItemGroup g join fetch g.group join fetch g.itemGroup " +
            "order by g.itemGroup.code asc, g.group.code asc")
    List<SpecialPriceItemGroup> findAllWithRefs();

    boolean existsByGroupIdAndItemGroupId(Long groupId, Long itemGroupId);

    boolean existsByGroupId(Long groupId);

    /** 특별단가그룹을 지울 때 그 그룹 줄도 함께 — 원본 확인 글 '…설정도 모두 삭제됩니다.' */
    void deleteByGroupId(Long groupId);

    @Query("select g from SpecialPriceItemGroup g where g.group.id = :groupId and g.itemGroup.id = :itemGroupId and g.active = true")
    Optional<SpecialPriceItemGroup> findActive(@Param("groupId") Long groupId, @Param("itemGroupId") Long itemGroupId);
}
