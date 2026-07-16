package com.erp.groupware.repository;

import com.erp.groupware.domain.BusinessContract;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface BusinessContractRepository extends JpaRepository<BusinessContract, Long> {

    @Query("select c from BusinessContract c join fetch c.partner " +
           "order by c.startDate desc, c.id desc")
    List<BusinessContract> findAllWithPartner();
}
