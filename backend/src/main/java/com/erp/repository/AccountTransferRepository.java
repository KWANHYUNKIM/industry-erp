package com.erp.repository;

import com.erp.domain.AccountTransfer;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface AccountTransferRepository extends JpaRepository<AccountTransfer, Long> {

    @Query("select t from AccountTransfer t " +
           "join fetch t.fromAccount join fetch t.toAccount left join fetch t.journalEntry " +
           "order by t.transferDate desc, t.id desc")
    List<AccountTransfer> findAllWithRefs();
}
