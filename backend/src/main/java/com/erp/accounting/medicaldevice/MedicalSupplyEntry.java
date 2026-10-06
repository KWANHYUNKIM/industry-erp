package com.erp.accounting.medicaldevice;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;
import lombok.*;

/**
 * 의료기기공급내역보고(C001403) 한 장 — 원본 [의료기기공급내역보고입력] 이 저장하는 것.
 *
 * <p>원본은 공급 내역을 그때그때 계산하지 않고 <b>보고할 줄을 저장한다</b>: 보고기준월 · 공급구분 ·
 * 공급형태를 고르고, 판매에서 시리얼(UDI)이 달린 줄을 불러와 납품일자 · 중고 여부 · 납품장소가다름여부를
 * 채운다. 목록은 그 줄을 [전송상태](미전송/전송)와 함께 보인다. 전송은 의료기기 통합시스템 연동이라
 * 우리는 하지 않는다 — 늘 미전송이다.
 */
@Entity
@Table(name = "medical_supply_entries")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class MedicalSupplyEntry extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** [전표일자-No.] 의 일자 · No. */
    @Column(name = "entry_date", nullable = false)
    private LocalDate entryDate;

    @Column(name = "entry_seq", nullable = false)
    private int entrySeq;

    /** [보고기준월] yyyy-MM */
    @Column(name = "report_month", nullable = false, length = 7)
    private String reportMonth;

    @Enumerated(EnumType.STRING)
    @Column(name = "supply_type", nullable = false, length = 10)
    private MedicalSupplyType supplyType;

    /** [공급형태코드] — 원본 라디오 넷의 글자 그대로. */
    @Column(name = "supply_shape", nullable = false, length = 30)
    private String supplyShape;

    /** [전송상태] — 통합시스템 전송을 하지 않으므로 늘 false 다. */
    @Column(nullable = false)
    @Builder.Default
    private boolean transmitted = false;

    @Column(name = "transmitted_at")
    private LocalDateTime transmittedAt;

    @Column(name = "created_by", length = 50)
    private String createdBy;

    @OneToMany(mappedBy = "entry", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("lineNo asc")
    @Builder.Default
    private List<MedicalSupplyEntryLine> lines = new ArrayList<>();
}
