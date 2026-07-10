package com.erp.domain;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 휴가 신청. 사원(user)별 휴가 종류/기간/일수와 결재 상태를 관리한다.
 */
@Entity
@Table(name = "vacation_requests")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class VacationRequest extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    /** 휴가 종류: 연차/반차/병가/경조 */
    @Column(nullable = false, length = 20)
    private String type;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    /** 사용 일수 (반차 0.5 등) */
    @Column(nullable = false, precision = 5, scale = 1)
    @Builder.Default
    private BigDecimal days = BigDecimal.ZERO;

    @Column(length = 200)
    private String reason;

    /** 결재 상태: 대기/승인/반려 */
    @Column(nullable = false, length = 10)
    @Builder.Default
    private String status = "대기";
}
