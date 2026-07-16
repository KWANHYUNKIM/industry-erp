package com.erp.inventory.repository;

import com.erp.inventory.domain.WarehouseLocation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface WarehouseLocationRepository extends JpaRepository<WarehouseLocation, Long> {

    boolean existsByWarehouseIdAndCode(Long warehouseId, String code);

    @Query("select l from WarehouseLocation l join fetch l.warehouse order by l.warehouse.code asc, l.code asc")
    List<WarehouseLocation> findAllWithWarehouse();
}
