package com.erp.accounting.medicaldevice;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface MedicalSupplyEntryRepository extends JpaRepository<MedicalSupplyEntry, Long> {

    @Query("select distinct e from MedicalSupplyEntry e left join fetch e.lines "
            + "where e.entryDate between ?1 and ?2 order by e.entryDate desc, e.entrySeq desc")
    List<MedicalSupplyEntry> findWithLines(LocalDate from, LocalDate to);

    @Query("select coalesce(max(e.entrySeq), 0) from MedicalSupplyEntry e where e.entryDate = ?1")
    int maxSeq(LocalDate date);

    /** 이미 보고한 판매 줄 — 같은 줄은 한 번만 보고한다. */
    @Query("select l.salesLineId from MedicalSupplyEntryLine l where l.salesLineId in ?1 and (?2 is null or l.entry.id <> ?2)")
    List<Long> reportedSalesLines(Collection<Long> salesLineIds, Long exceptEntryId);

    @Query("select l.salesLineId from MedicalSupplyEntryLine l where l.salesLineId is not null")
    List<Long> allReportedSalesLines();
}
