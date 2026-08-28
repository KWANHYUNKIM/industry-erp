package com.erp.accounting.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import com.erp.common.BaseTimeEntity;

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

    /**
     * 원본 계좌등록의 [계좌코드]. 이 저장소의 다른 마스터는 <b>모두 코드로 식별</b>되는데
     * 계좌만 없어서, 코드도움에서도 은행·계좌번호를 통째로 외워야 골랐다.
     * 이미 있는 계좌에는 코드가 없으므로 nullable 이다.
     */
    @Column(length = 20)
    private String code;

    /** 원본 계좌등록의 [계좌명] — '주거래통장' 처럼 <b>사람이 부르는 이름</b>이다. */
    @Column(length = 100)
    private String name;

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
