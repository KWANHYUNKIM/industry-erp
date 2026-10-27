package com.erp.settings.company;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * 회사(테넌트) 레지스트리 한 건. 로그인 전에(테넌트를 모르는 상태에서) 조회해야 하므로
 * 항상 {@code public} 스키마의 companies 를 본다({@code @Table(schema = "public")}).
 * <p>
 * 각 회사는 자기 데이터 스키마({@link #schemaName})를 갖는다. 본사는 기존 데이터가 있는 public.
 */
@Entity
@Table(name = "companies", schema = "public")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Company {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 로그인 시 입력하는 회사코드 */
    @Column(nullable = false, unique = true, length = 20)
    private String code;

    @Column(nullable = false, length = 100)
    private String name;

    /** 이 회사의 데이터 스키마명 (본사=public, 그 외 co_000N) */
    @Column(name = "schema_name", nullable = false, unique = true, length = 63)
    private String schemaName;

    @Column(nullable = false)
    @Builder.Default
    private boolean active = true;

    @Column(name = "created_at")
    private LocalDateTime createdAt;

    /** 쓸 수 있는 사용자(사용 중인 계정) 수. 비면 제한 없음. */
    @Column(name = "max_users")
    private Integer maxUsers;

    /** 사용기한(이 날까지 쓴다). 비면 무기한. 지나면 로그인도, 이미 받은 토큰도 막힌다. */
    @Column(name = "expires_on")
    private LocalDate expiresOn;

    /** 오늘 쓸 수 있는가 — 사용 중이고 기한이 지나지 않았다. */
    public boolean usableOn(LocalDate today) {
        return active && (expiresOn == null || !today.isAfter(expiresOn));
    }
}
