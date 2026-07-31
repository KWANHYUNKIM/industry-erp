package com.erp.accounting.domain;

import com.erp.accounting.domain.enums.EvidenceMethod;
import com.erp.common.BaseTimeEntity;
import com.erp.common.StoredFile;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDate;

/**
 * 전표 증빙(증빙센터 E040730). 판매·구매·비용 어느 전표에나 붙일 수 있어야 하므로
 * 대상은 {@code entityType + entityId} 로 <b>FK 없이</b> 가리킨다(사용자정의필드와 같은 방식).
 *
 * FK 를 걸면 증빙 테이블이 판매·구매·비용 세 모듈에 동시에 묶여, 어느 모듈에도 두기 어려워진다.
 * 대신 지운 전표의 증빙이 남을 수 있으므로, 전표 삭제 경로에서 증빙도 함께 지운다.
 */
@Entity
@Table(name = "evidence_attachments")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class EvidenceAttachment extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 대상 전표 종류(=원본의 '메뉴'): SALES / PURCHASE / EXPENSE */
    @Column(name = "entity_type", nullable = false, length = 30)
    private String entityType;

    @Column(name = "entity_id", nullable = false)
    private Long entityId;

    /** 표시용 전표번호. 목록에서 전표를 다시 조회하지 않으려고 새겨 둔다. */
    @Column(name = "doc_no", length = 50)
    private String docNo;

    @Column(name = "doc_date")
    private LocalDate docDate;

    @Column(name = "evidence_date")
    private LocalDate evidenceDate;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private EvidenceMethod method;

    /** 증빙을 등록한 사람 */
    @Column(length = 50)
    private String worker;

    @Column(length = 300)
    private String note;

    /** 첨부파일. null 이면 증빙방법만 기록한 것(원본의 '증빙첨부 없음'). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "file_id")
    private StoredFile file;
}
