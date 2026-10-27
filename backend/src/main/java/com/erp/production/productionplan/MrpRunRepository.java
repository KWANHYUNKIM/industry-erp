package com.erp.production.productionplan;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface MrpRunRepository extends JpaRepository<MrpRun, Long> {

    @Query("select r from MrpRun r left join fetch r.baseItem order by r.runDate desc, r.id desc")
    List<MrpRun> findAllWithRefs();
}
