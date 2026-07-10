package com.erp.repository;

import com.erp.domain.AsRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface AsRequestRepository extends JpaRepository<AsRequest, Long> {

    @Query("select a from AsRequest a join fetch a.partner join fetch a.item " +
            "order by a.receiptDate desc, a.id desc")
    List<AsRequest> findAllWithRefs();
}
