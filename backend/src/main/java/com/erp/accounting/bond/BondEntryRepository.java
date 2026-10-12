package com.erp.accounting.bond;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

public interface BondEntryRepository extends JpaRepository<BondEntry, Long> {

    @Query("select coalesce(max(e.entryNo), 0) from BondEntry e where e.side = :side and e.entryDate = :date")
    int maxEntryNo(@Param("side") BondSide side, @Param("date") LocalDate date);

    @Query("select distinct e from BondEntry e left join fetch e.lines l " +
           "left join fetch l.account left join fetch l.partner left join fetch l.project " +
           "where e.side = :side and e.entryDate <= :to " +
           "order by e.entryDate desc, e.entryNo desc")
    List<BondEntry> findUpTo(@Param("side") BondSide side, @Param("to") LocalDate to);

    @Query("select distinct e from BondEntry e left join fetch e.lines l " +
           "left join fetch l.account left join fetch l.partner left join fetch l.project where e.id = :id")
    Optional<BondEntry> findWithLines(@Param("id") Long id);
}
