package com.erp.accounting.account;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 계정별 적요 마스터 — 계정등록 목록 [적요] '등록' → 창 '적요리스트'(☐ · 적요코드 · 적요명, 신규(F2) · 선택삭제 · 닫기),
 * [신규(F2)] → '적요등록'(적요코드 처음 01 · 적요명, 저장(F8) · 닫기), 줄을 누르면 같은 창에 [삭제] · [H] (2026-10-22 loginaa 실측, V457).
 */
@Entity
@Table(name = "account_remarks")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class AccountRemark extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id", nullable = false)
    private Account account;

    @Column(nullable = false, length = 10)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;
}
