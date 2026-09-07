package com.erp.production.repository;

import com.erp.production.domain.BorOperation;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface BorRepository extends JpaRepository<BorOperation, Long> {

    /** 목록은 품목·공정까지 한 번에 가져온다(N+1 방지). */
    @Query("select o from BorOperation o "
            + "join fetch o.product join fetch o.process "
            + "order by o.product.code asc, o.seq asc")
    List<BorOperation> findAllWithRefs();

    /** 한 품목의 작업들. 표준시간 계산이 쓴다. */
    @Query("select o from BorOperation o join fetch o.process "
            + "where o.product.id = :productId and o.active = true order by o.seq asc")
    List<BorOperation> findActiveByProduct(Long productId);

    Optional<BorOperation> findByProduct_IdAndSeq(Long productId, Integer seq);

    long countByProcess_Id(Long processId);
}
