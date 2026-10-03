package com.erp.hr.certificate;

import com.erp.common.BaseTimeEntity;
import com.erp.hr.employee.Employee;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * 각종증명서 발급 대장 한 줄. 발행번호는 발행일의 해와 그해 차례(2026-1)다.
 * 증명서 본문은 저장하지 않고 인쇄할 때 사원의 지금 값으로 그린다.
 */
@Entity
@Table(name = "hr_certificates")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Certificate extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "issue_year", nullable = false)
    private Integer issueYear;

    @Column(name = "issue_seq", nullable = false)
    private Integer issueSeq;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private CertificateKind kind;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "employee_id")
    private Employee employee;

    @Column(length = 200)
    private String purpose;

    @Column(name = "issue_date", nullable = false)
    private LocalDate issueDate;
}
