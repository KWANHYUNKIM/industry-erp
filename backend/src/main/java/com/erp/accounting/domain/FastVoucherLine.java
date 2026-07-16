package com.erp.accounting.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/** 간편전표 한 줄. 지출/입금/사용 내역 하나가 계정 하나에 대응한다. */
@Entity
@Table(name = "fast_voucher_lines")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class FastVoucherLine {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "voucher_id", nullable = false)
    private FastVoucher voucher;

    /** 지출결의서면 비용계정, 입금보고서면 수입/채권계정, 가지급금정산서면 실제 사용한 비용계정 */
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal amount;

    @Column(length = 200)
    private String description;

    @Column(nullable = false)
    private Integer lineNo;
}
