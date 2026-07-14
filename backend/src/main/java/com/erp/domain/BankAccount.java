package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;

/**
 * 계좌등록 (회계 I > 기초등록 > 계좌/카드).
 * 입출금이 생길 때마다 balance 를 갱신하고, 같은 금액으로 분개를 남긴다.
 * glAccount 는 이 계좌가 분개될 때 쓰는 계정과목(보통예금 103, 당좌예금 102 등).
 */
@Entity
@Table(name = "bank_accounts")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class BankAccount extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 50)
    private String bankName;

    @Column(nullable = false, unique = true, length = 50)
    private String accountNo;

    /** 예금주 */
    @Column(length = 50)
    private String holder;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "gl_account_id", nullable = false)
    private Account glAccount;

    @Column(nullable = false, precision = 18, scale = 2)
    private BigDecimal balance;

    @Column(nullable = false)
    private boolean active;

    @Column(length = 200)
    private String remark;
}
