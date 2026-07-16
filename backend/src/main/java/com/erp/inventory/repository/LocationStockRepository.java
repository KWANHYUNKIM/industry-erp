package com.erp.inventory.repository;

import com.erp.inventory.domain.LocationStock;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

public interface LocationStockRepository extends JpaRepository<LocationStock, Long> {

    Optional<LocationStock> findByLocationIdAndItemId(Long locationId, Long itemId);

    List<LocationStock> findByLocationId(Long locationId);

    /** 수량이 남아 있는 배치가 있는지. 수량 0 행은 빈 선반이므로 삭제를 막지 않는다. */
    boolean existsByLocationIdAndQuantityGreaterThan(Long locationId, BigDecimal quantity);

    /** 목록에서 로케이션·창고·품목명을 함께 쓰므로 fetch join 한다 (N+1 방지). */
    @Query("select s from LocationStock s "
            + "join fetch s.location l join fetch l.warehouse join fetch s.item "
            + "where s.quantity > 0 "
            + "order by l.warehouse.code asc, l.code asc, s.item.code asc")
    List<LocationStock> findAllWithRefs();

    /**
     * 같은 (품목, 창고)에 이미 배치된 수량 합계. 창고 재고에서 이걸 빼면 미배치 수량이다.
     * 배치 합계가 창고 재고를 넘지 않는지 검증할 때 쓴다.
     */
    @Query("select coalesce(sum(s.quantity), 0) from LocationStock s "
            + "where s.item.id = :itemId and s.location.warehouse.id = :warehouseId")
    BigDecimal sumByItemAndWarehouse(@Param("itemId") Long itemId, @Param("warehouseId") Long warehouseId);
}
