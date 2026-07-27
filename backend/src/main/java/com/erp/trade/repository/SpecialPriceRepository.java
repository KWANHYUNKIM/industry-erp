package com.erp.trade.repository;

import com.erp.trade.domain.SpecialPrice;
import com.erp.trade.domain.enums.SpecialPriceType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface SpecialPriceRepository extends JpaRepository<SpecialPrice, Long> {

    @Query("select sp from SpecialPrice sp " +
            "join fetch sp.item " +
            "left join fetch sp.partner " +
            "order by sp.tradeType asc, sp.item.name asc, sp.id desc")
    List<SpecialPrice> findAllWithRefs();

    /** 거래처별 특별단가(활성) — resolve 1순위 */
    @Query("select sp from SpecialPrice sp " +
            "where sp.tradeType = :type and sp.active = true " +
            "and sp.item.id = :itemId and sp.partner.id = :partnerId " +
            "order by sp.id desc")
    List<SpecialPrice> findActiveByPartner(@Param("type") SpecialPriceType type,
                                           @Param("itemId") Long itemId,
                                           @Param("partnerId") Long partnerId);

    /** 특별단가그룹별 특별단가(활성) — resolve 2순위 */
    @Query("select sp from SpecialPrice sp " +
            "where sp.tradeType = :type and sp.active = true " +
            "and sp.item.id = :itemId and sp.partner is null and sp.priceGroup = :priceGroup " +
            "order by sp.id desc")
    List<SpecialPrice> findActiveByGroup(@Param("type") SpecialPriceType type,
                                         @Param("itemId") Long itemId,
                                         @Param("priceGroup") String priceGroup);
}
