package com.erp.hr.vacation;

import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import com.erp.auth.user.User;
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

    /**
     * 근태를 올린 계정. 전자결재 휴가신청서처럼 계정에서 들어온 근태만 든다 — 근태입력은 사원 기준이라
     * 계정이 없는 사원의 근태는 비어 있다(V424).
     */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    /** 근태의 사원 — 원본 근태입력(E020710)은 사원(사원번호 · 사원명 · 부서) 기준이다. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id")
    private com.erp.hr.employee.Employee employee;


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
