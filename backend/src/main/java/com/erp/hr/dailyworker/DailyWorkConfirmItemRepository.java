package com.erp.hr.dailyworker;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface DailyWorkConfirmItemRepository extends JpaRepository<DailyWorkConfirmItem, Long> {

    @Query("select i from DailyWorkConfirmItem i join fetch i.item join fetch i.confirm c join fetch c.worker where c.ledger.id = :ledgerId")
    List<DailyWorkConfirmItem> findByLedger(Long ledgerId);

    @Query("select i from DailyWorkConfirmItem i join fetch i.item join fetch i.confirm c join fetch c.ledger g join fetch c.worker w "
            + "left join fetch w.department where g.payMonth between :from and :to order by g.payMonth, g.seq, w.code")
    List<DailyWorkConfirmItem> findInMonths(String from, String to);

    boolean existsByItem_Id(Long itemId);
}
