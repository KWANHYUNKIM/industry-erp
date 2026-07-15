package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

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
}
