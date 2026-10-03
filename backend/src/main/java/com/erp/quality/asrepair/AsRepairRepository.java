package com.erp.quality.asrepair;

import java.time.LocalDate;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface AsRepairRepository extends JpaRepository<AsRepair, Long> {

    boolean existsByAsRequestId(Long asRequestId);
    @Query("select r from AsRepair r join fetch r.partner join fetch r.warehouse left join fetch r.asRequest "
            + "where r.repairDate between ?1 and ?2 order by r.repairDate desc, r.repairNo desc")
    List<AsRepair> findWithRefs(LocalDate from, LocalDate to);
}
