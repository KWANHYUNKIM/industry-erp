package com.erp.hr.employee;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * 원본 인사카드 [인사자료] 입력 창의 한 줄. 항목마다 열이 달라 날짜 둘 + 글자 칸 일곱으로 담는다.
 * <ul>
 *   <li>학력사항: 학력 · 학교명 · 입학일자(fromDate) · 졸업일자(toDate) · 주야구분 · 전공명 · 소재지 · 기타 · 졸업구분</li>
 *   <li>경력사항: 입사일자(fromDate) · 퇴사일자(toDate) · 회사명 · 직위 · 담당업무(부서) · 퇴사사유</li>
 * </ul>
 * 글자 칸 차례는 화면(HR_DETAIL_COLUMNS)이 정한다.
 */
@Entity
@Table(name = "employee_hr_details")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class EmployeeHrDetail {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "employee_id", nullable = false)
    private Employee employee;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private HrDetailCategory category;

    @Column(name = "line_no", nullable = false)
    private int lineNo;

    @Column(name = "from_date")
    private LocalDate fromDate;

    @Column(name = "to_date")
    private LocalDate toDate;

    /** 자격ㆍ면허의 갱신일자 · 말소일자처럼 날짜가 둘보다 많은 항목 */
    @Column(name = "date3")
    private LocalDate date3;

    @Column(name = "date4")
    private LocalDate date4;

    @Column(length = 100) private String text1;
    @Column(length = 100) private String text2;
    @Column(length = 100) private String text3;
    @Column(length = 100) private String text4;
    @Column(length = 100) private String text5;
    @Column(length = 100) private String text6;
    @Column(length = 100) private String text7;
    @Column(length = 100) private String text8;
    @Column(length = 100) private String text9;
    @Column(length = 100) private String text10;
}
