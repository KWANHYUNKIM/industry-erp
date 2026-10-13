package com.erp.accounting.retirementpay;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface RetirementPayRepository extends JpaRepository<RetirementPay, Long> {

    @Query("select r from RetirementPay r join fetch r.employee e left join fetch e.department " +
           "where r.retireDate between :from and :to order by r.retireDate desc, r.id desc")
    List<RetirementPay> findBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
