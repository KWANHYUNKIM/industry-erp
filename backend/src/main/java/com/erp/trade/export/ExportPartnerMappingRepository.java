package com.erp.trade.export;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Optional;

public interface ExportPartnerMappingRepository extends JpaRepository<ExportPartnerMapping, Long> {

    Optional<ExportPartnerMapping> findByPartnerId(Long partnerId);

    @Query("select m from ExportPartnerMapping m join fetch m.partner p order by p.code, m.id")
    List<ExportPartnerMapping> findAllWithPartner();
}
