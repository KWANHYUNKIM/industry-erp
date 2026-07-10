package com.erp.repository;

import com.erp.domain.Lot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface LotRepository extends JpaRepository<Lot, Long> {

    boolean existsByLotNo(String lotNo);

    @Query("select l from Lot l join fetch l.item left join fetch l.warehouse " +
            "order by l.inboundDate desc, l.id desc")
    List<Lot> findAllWithRefs();
}
