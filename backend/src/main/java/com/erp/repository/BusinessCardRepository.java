package com.erp.repository;

import com.erp.domain.BusinessCard;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface BusinessCardRepository extends JpaRepository<BusinessCard, Long> {

    /** 목록에서 거래처명·보유자명을 함께 쓰므로 fetch join 한다 (N+1 방지). */
    @Query("select c from BusinessCard c left join fetch c.partner left join fetch c.owner "
            + "order by c.name asc")
    List<BusinessCard> findAllWithRefs();
}
