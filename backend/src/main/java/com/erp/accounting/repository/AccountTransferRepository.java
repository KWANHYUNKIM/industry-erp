package com.erp.accounting.repository;

import com.erp.accounting.domain.AccountTransfer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface AccountTransferRepository extends JpaRepository<AccountTransfer, Long> {

    @Query("select t from AccountTransfer t " +
           "join fetch t.fromAccount join fetch t.toAccount left join fetch t.journalEntry " +
           "where t.transferDate >= :from and t.transferDate <= :to " +
           "order by t.transferDate desc, t.id desc")
    List<AccountTransfer> findAllWithRefs(@org.springframework.data.repository.query.Param("from") java.time.LocalDate from,
                             @org.springframework.data.repository.query.Param("to") java.time.LocalDate to);
}
