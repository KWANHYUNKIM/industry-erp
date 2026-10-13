package com.erp.trade.export;

import com.erp.common.BaseTimeEntity;
import com.erp.trade.partner.BusinessPartner;
import jakarta.persistence.*;
import lombok.*;

/**
 * 원본 Invoice/Packing List 의 <b>[매핑조회]</b> 한 줄 — 거래처마다 마지막으로 저장한 인보이스 머리 칸.
 *
 * <p>2026-10-12 loginaa 실측: 인보이스를 저장하면 그 거래처 줄이 생기거나 바뀌고, 다음 인보이스에서
 * 그 거래처를 고르면 L/C Issuing Bank · Shipper · Messrs · Notify Party · Port of Loading ·
 * Final destination · Carrier · 중량단위 · Remarks 가 채워진다. 그 거래처의 마지막 인보이스를
 * 지우면 줄도 사라진다.
 */
@Entity
@Table(name = "export_partner_mappings")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ExportPartnerMapping extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "partner_id", nullable = false, unique = true)
    private BusinessPartner partner;

    @Column(name = "lc_bank", length = 300)
    private String lcBank;

    @Column(length = 300)
    private String shipper;

    @Column(length = 300)
    private String messrs;

    @Column(name = "notify_party", length = 300)
    private String notifyParty;

    @Column(name = "port_of_loading", length = 100)
    private String portOfLoading;

    @Column(length = 100)
    private String destination;

    @Column(length = 100)
    private String carrier;

    @Column(name = "weight_unit", length = 20)
    private String weightUnit;

    @Column(length = 300)
    private String remark;

    /** 인보이스 머리에서 기억할 칸을 그대로 옮긴다. */
    void copyFrom(ExportOrder e) {
        this.lcBank = e.getLcBank();
        this.shipper = e.getShipper();
        this.messrs = e.getMessrs();
        this.notifyParty = e.getNotifyParty();
        this.portOfLoading = e.getPortOfLoading();
        this.destination = e.getDestination();
        this.carrier = e.getCarrier();
        this.weightUnit = e.getWeightUnit();
        this.remark = e.getRemark();
    }
}
