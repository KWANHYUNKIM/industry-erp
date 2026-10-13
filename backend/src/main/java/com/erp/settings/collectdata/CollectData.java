package com.erp.settings.collectdata;

import com.erp.common.BaseTimeEntity;
import jakarta.persistence.*;
import lombok.*;

/**
 * 데이터센터 › 수집데이터등록(C001401) 한 줄 = <b>무엇을 어디서 받아 모을지</b>.
 *
 * <p>원본은 수집대상이 Email 하나이고, [수신문서](거래명세서·견적서·발주서)와 [보낸회사]로 거른다.
 * 문서마다 기본 줄이 하나씩 처음부터 있다(builtIn — 코드 없음 · 고칠 수도 지울 수도 없음).
 * 사용자가 더한 줄은 [데이터코드]를 00001 부터 매기고 [조건]을 '거래명세서 AND 보낸회사' 로 보인다.
 *
 * <p>예전 수집데이터등록은 <b>우리 API 엔드포인트 목록</b>(collect_sources)을 등록하는 화면이었다 —
 * 원본에 없는 개념이다. 그 표는 데이터수집 화면이 그대로 읽는다.
 */
@Entity
@Table(name = "collect_data")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class CollectData extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** [데이터코드]. 기본 줄은 비어 있다. */
    @Column(length = 20)
    private String code;

    /** [데이터명] */
    @Column(nullable = false, length = 100)
    private String name;

    /** [수집대상] 의 수신 경로. 원본은 Email 하나뿐이다. */
    @Column(nullable = false, length = 10)
    @Builder.Default
    private String channel = "EMAIL";

    /** [수신문서] */
    @Enumerated(EnumType.STRING)
    @Column(name = "doc_type", nullable = false, length = 20)
    private CollectDocType docType;

    /** [보낸회사] — 비우면 그 문서를 보낸 회사를 가리지 않는다. */
    @Column(name = "sender_company", length = 100)
    private String senderCompany;

    /** 처음부터 있는 줄(문서마다 하나). 고칠 수도 지울 수도 없다. */
    @Column(name = "built_in", nullable = false)
    @Builder.Default
    private boolean builtIn = false;

    /** 원본 조건 [최초작성자] · [최종수정자] */
    @Column(name = "created_by", length = 50)
    private String createdBy;

    @Column(name = "updated_by", length = 50)
    private String updatedBy;
}
