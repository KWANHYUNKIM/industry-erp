package com.erp.accounting.extrafield;

import com.erp.accounting.account.Account;
import jakarta.persistence.*;
import lombok.*;

/** 유형 × 계정 — [계정설정]. */
@Entity
@Table(name = "extra_field_type_accounts")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ExtraFieldTypeAccount {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "type_id")
    private ExtraFieldType type;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "account_id")
    private Account account;
}
