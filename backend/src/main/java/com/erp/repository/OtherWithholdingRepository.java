package com.erp.repository;

import com.erp.domain.OtherWithholding;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;

public interface OtherWithholdingRepository extends JpaRepository<OtherWithholding, Long> {

    @Query("select w from OtherWithholding w left join fetch w.partner "
            + "where w.payDate between :from and :to "
            + "order by w.payDate desc, w.id desc")
    List<OtherWithholding> findBetween(@Param("from") LocalDate from, @Param("to") LocalDate to);
}
