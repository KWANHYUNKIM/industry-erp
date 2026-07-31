package com.erp.groupware.domain;

import com.erp.auth.domain.User;
import com.erp.common.BaseTimeEntity;
import com.erp.trade.domain.BusinessPartner;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * 쪽지 — 사용자끼리 주고받는 단문 메시지. 메일과 달리 제목이 없고 본문 한 줄이며,
 * 시스템이 보내는 자동알림(전자결재 완료·안전재고 미만 등)의 도착지이기도 하다.
 *
 * 자동알림은 보낸 사람이 없다({@code sender == null}). 사람이 보낸 쪽지와 한 테이블에 두는 이유는
 * 받는 쪽에서 보면 둘 다 똑같이 "확인해야 할 알림"이고, 목록·읽음·보관을 따로 만들 이유가 없어서다.
 */
@Entity
@Table(name = "short_messages")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class ShortMessage extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    /** 보낸 사람. null 이면 시스템 자동알림. */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_id")
    private User sender;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "recipient_id", nullable = false)
    private User recipient;

    /** 거래처 관련 쪽지일 때 연결(검색 조건 '거래처'). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "partner_id")
    private BusinessPartner partner;

    @Column(nullable = false, columnDefinition = "text")
    private String content;

    @Column(name = "sent_at", nullable = false)
    private LocalDateTime sentAt;

    /** 확인(읽음) 시각. null 이면 미확인. */
    @Column(name = "read_at")
    private LocalDateTime readAt;

    /** 보관함으로 옮긴 쪽지. 받은 쪽지 목록에서 빠지고 보관함에만 보인다. */
    @Column(nullable = false)
    @Builder.Default
    private boolean archived = false;

    /** 연결전표 표시용 출처(예: 전자결재, 재고현황). 자동알림에서 채운다. */
    @Column(name = "link_source", length = 40)
    private String linkSource;

    /** 연결전표 식별(예: 기안번호). 화면에 그대로 보여준다. */
    @Column(name = "link_ref", length = 100)
    private String linkRef;

    /** 연결전표로 이동할 프론트 경로(예: /groupware/approvals). null 이면 링크 없이 텍스트만. */
    @Column(name = "link_path", length = 200)
    private String linkPath;

    public boolean isSystem() {
        return sender == null;
    }
}
