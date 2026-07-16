package com.erp.inventory.repository;

import com.erp.inventory.domain.Lot;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface LotRepository extends JpaRepository<Lot, Long> {

    boolean existsByLotNo(String lotNo);

    /** 품질검사의 자유입력 로트No.를 등록된 로트와 연결하기 위한 조회 */
    Optional<Lot> findByLotNo(String lotNo);

    @Query("select l from Lot l join fetch l.item left join fetch l.warehouse " +
            "order by l.inboundDate desc, l.id desc")
    List<Lot> findAllWithRefs();
}
