package com.erp.trade.repository;

import com.erp.trade.domain.MallItemMapping;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;

public interface MallItemMappingRepository extends JpaRepository<MallItemMapping, Long> {

    @Query("select m from MallItemMapping m join fetch m.item order by m.mall asc, m.mallProductCode asc")
    List<MallItemMapping> findAllWithItem();

    boolean existsByMallAndMallProductCode(String mall, String mallProductCode);

    /** 수집 자동연결용: 활성 매핑 조회 */
    @Query("select m from MallItemMapping m join fetch m.item " +
            "where m.mall = :mall and m.mallProductCode = :code and m.active = true")
    Optional<MallItemMapping> findActive(@Param("mall") String mall, @Param("code") String code);
}
