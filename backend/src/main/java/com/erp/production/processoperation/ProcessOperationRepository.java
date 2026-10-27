package com.erp.production.processoperation;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface ProcessOperationRepository extends JpaRepository<ProcessOperation, Long> {

    @Query("select o from ProcessOperation o join fetch o.process "
            + "order by o.process.sortOrder asc, o.process.code asc, o.seq asc")
    List<ProcessOperation> findAllWithProcess();

    boolean existsByCode(String code);
}
