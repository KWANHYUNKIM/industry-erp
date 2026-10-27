package com.erp.accounting.importcost;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ImportLotRepository extends JpaRepository<ImportLot, Long> {
    @Query("select l from ImportLot l join fetch l.partner order by l.code")
    List<ImportLot> findAllWithPartner();

    boolean existsByCode(String code);

    @Query("select l.code from ImportLot l")
    List<String> findAllCodes();
}
