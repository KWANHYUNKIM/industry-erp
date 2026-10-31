package com.erp.accounting.asset.fixedasset;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface DepreciationCalcRepository extends JpaRepository<DepreciationCalc, Long> {

    @Query("select c from DepreciationCalc c order by c.periodTo desc, c.id desc")
    List<DepreciationCalc> findAllNewestFirst();
}
