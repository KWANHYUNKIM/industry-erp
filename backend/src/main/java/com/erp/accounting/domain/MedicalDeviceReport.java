package com.erp.accounting.domain;

import com.erp.common.BaseTimeEntity;
import com.erp.common.StoredFile;
import jakarta.persistence.*;
import lombok.*;

import java.math.BigDecimal;
import java.time.LocalDate;

/**
 * 의료기기 공급내역 보고(E040231)로 <b>산출한 보고파일</b> 한 건 = 원본의 '송신이력' 한 줄.
 *
 * 우리는 심평원 전송 채널·인증서가 없으므로 '전송'하지 않는다. 대신 그 달의 공급내역을 확정해
 * 보고파일(CSV)로 만들어 보관하고, 그 이력을 남긴다. 전송 채널이 붙으면 이 행에 전송상태·접수번호를
 * 더하면 되고, 산출 로직은 그대로 쓴다.
 */
@Entity
@Table(name = "medical_device_reports")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class MedicalDeviceReport extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 보고기준월 (yyyy-MM) */
    @Column(name = "report_month", nullable = false, length = 7)
    private String reportMonth;

    @Column(name = "period_from", nullable = false)
    private LocalDate periodFrom;

    @Column(name = "period_to", nullable = false)
    private LocalDate periodTo;

    @Column(name = "line_count", nullable = false)
    private int lineCount;

    @Column(name = "total_qty", nullable = false, precision = 18, scale = 2)
    @Builder.Default
    private BigDecimal totalQty = BigDecimal.ZERO;

    /** 산출한 보고파일(CSV) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "file_id")
    private StoredFile file;

    @Column(name = "created_by", length = 50)
    private String createdBy;
}
