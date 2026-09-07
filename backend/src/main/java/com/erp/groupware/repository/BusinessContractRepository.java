package com.erp.groupware.repository;

import com.erp.groupware.domain.BusinessContract;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface BusinessContractRepository extends JpaRepository<BusinessContract, Long> {

    @Query("select c from BusinessContract c join fetch c.partner " +
           "where c.startDate >= :from and c.startDate <= :to " +
           "order by c.startDate desc, c.id desc")
    List<BusinessContract> findAllWithPartner(@org.springframework.data.repository.query.Param("from") java.time.LocalDate from,
                                              @org.springframework.data.repository.query.Param("to") java.time.LocalDate to);
}
