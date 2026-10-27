package com.erp.hr.certificate;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;

public interface CertificateRepository extends JpaRepository<Certificate, Long> {

    /** 원본 목록 차례 — 최근 발행이 위. */
    @Query("select c from Certificate c join fetch c.employee e left join fetch e.department "
            + "order by c.issueYear desc, c.issueSeq desc")
    List<Certificate> findAllWithRefs();

    @Query("select coalesce(max(c.issueSeq), 0) from Certificate c where c.issueYear = :year")
    int maxSeq(int year);
}
