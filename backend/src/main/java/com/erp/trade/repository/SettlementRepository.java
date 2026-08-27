package com.erp.trade.repository;

import com.erp.trade.domain.Settlement;
import com.erp.trade.domain.SettlementType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.math.BigDecimal;
import java.util.List;

public interface SettlementRepository extends JpaRepository<Settlement, Long> {

    @Query("select s from Settlement s join fetch s.partner order by s.settleDate desc, s.id desc")
    List<Settlement> findAllWithPartner();

    /** 거래처별 정산 합계 (유형별) */
    @Query("select s.partner.id as partnerId, coalesce(sum(s.amount),0) as total " +
            "from Settlement s where s.type = :type group by s.partner.id")
    List<PartnerAmount> sumByPartner(SettlementType type);

    /** 거래처별 정산 합계 — 기준일자까지(채권/채무현황의 as-of 잔액). */
    @Query("select s.partner.id as partnerId, coalesce(sum(s.amount),0) as total " +
            "from Settlement s where s.type = :type and s.settleDate <= :asOf group by s.partner.id")
    List<PartnerAmount> sumByPartnerUntil(SettlementType type, java.time.LocalDate asOf);

    /** 거래처별 정산 합계 — 기간 내(거래처별채권의 [수금합계]·채무의 [지급합계]). */
    @Query("select s.partner.id as partnerId, coalesce(sum(s.amount),0) as total " +
            "from Settlement s where s.type = :type and s.settleDate between :from and :to " +
            "group by s.partner.id")
    List<PartnerAmount> sumByPartnerBetween(SettlementType type,
                                            java.time.LocalDate from, java.time.LocalDate to);

    interface PartnerAmount {
        Long getPartnerId();
        BigDecimal getTotal();
    }
}
