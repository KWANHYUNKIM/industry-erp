package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

/**
 * 보안정책 (단일 레코드). Self-Customizing > 보안관리.
 * ddl-auto:update 환경이므로 nullable=false 컬럼은 반드시 @Builder.Default + DB default 를 지정한다.
 */
@Entity
@Table(name = "security_policy")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class SecurityPolicy extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 최소 비밀번호 길이(자) */
    @Builder.Default
    @Column(nullable = false, columnDefinition = "integer default 8")
    private Integer pwLength = 8;

    /** 비밀번호 변경주기(일) */
    @Builder.Default
    @Column(nullable = false, columnDefinition = "integer default 90")
    private Integer pwCycleDays = 90;

    /** 로그인 실패 잠금(회) */
    @Builder.Default
    @Column(nullable = false, columnDefinition = "integer default 5")
    private Integer loginFailLimit = 5;

    /** 세션 자동종료(분) */
    @Builder.Default
    @Column(nullable = false, columnDefinition = "integer default 30")
    private Integer sessionTimeout = 30;

    /** 허용 IP 대역 제한 사용 */
    @Builder.Default
    @Column(nullable = false, columnDefinition = "boolean default false")
    private Boolean ipRestrict = false;

    /** 2단계 인증(OTP) 사용 */
    @Builder.Default
    @Column(nullable = false, columnDefinition = "boolean default false")
    private Boolean twoFactor = false;
}
