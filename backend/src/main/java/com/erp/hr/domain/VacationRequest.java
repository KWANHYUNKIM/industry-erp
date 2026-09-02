package com.erp.hr.domain;

import com.erp.hr.domain.enums.VacationStatus;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.auth.domain.User;
import com.erp.common.BaseTimeEntity;

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


    /**
     * 근태번호 (AT-yyyyMMdd-####). 원본 근태조회의 첫 열이 [근태번호] 다.
     *
     * <p>번호가 없으면 "그 근태 건" 을 지목할 방법이 없어 사원과 일자로 더듬어야 한다.
     */
    @Column(name = "doc_no", nullable = false, unique = true, length = 30)
    private String docNo;

    /** 휴가 종류: 연차/반차/병가/경조 */
    @Column(nullable = false, length = 20)
    private String type;

    @Column(name = "start_date", nullable = false)
    private LocalDate startDate;

    @Column(name = "end_date", nullable = false)
    private LocalDate endDate;

    /**
     * 사용 일수. 반차 0.5, 시간 단위 0.125(1시간) 까지 담는다.
     * scale=1 이던 시절 DB 가 0.125 를 0.1 로 잘라, 쓴 만큼과 잔여가 어긋났다.
     */
    @Column(nullable = false, precision = 6, scale = 3)
    @Builder.Default
    private BigDecimal days = BigDecimal.ZERO;

    @Column(length = 200)
    private String reason;

    /** 결재 상태 */
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private VacationStatus status = VacationStatus.PENDING;
}
