package com.erp.accounting.repository;

import com.erp.accounting.domain.CorporateTaxReturn;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface CorporateTaxReturnRepository extends JpaRepository<CorporateTaxReturn, Long> {

    boolean existsByFiscalYear(int fiscalYear);

    Optional<CorporateTaxReturn> findByFiscalYear(int fiscalYear);

    /** 목록에서 조정 항목까지 함께 쓰므로 fetch join 한다 (N+1 방지). */
    @Query("select distinct r from CorporateTaxReturn r left join fetch r.adjustments "
            + "order by r.fiscalYear desc")
    List<CorporateTaxReturn> findAllWithAdjustments();
}
