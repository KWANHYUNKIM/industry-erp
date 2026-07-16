package com.erp.accounting.repository;

import com.erp.accounting.domain.FastVoucher;
import com.erp.accounting.domain.enums.FastVoucherType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface FastVoucherRepository extends JpaRepository<FastVoucher, Long> {

    @Query("select distinct v from FastVoucher v " +
           "join fetch v.lines l join fetch l.account " +
           "left join fetch v.bankAccount left join fetch v.partner left join fetch v.journalEntry " +
           "where (:type is null or v.type = :type) " +
           "order by v.voucherDate desc, v.id desc")
    List<FastVoucher> findAllWithRefs(FastVoucherType type);
}
