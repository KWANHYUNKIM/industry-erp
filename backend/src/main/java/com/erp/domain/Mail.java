package com.erp.domain;

import com.erp.domain.enums.MailStatus;
import com.erp.domain.enums.MailType;
import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

/**
 * 메일. 사내메일(사용자끼리)과 공용메일(회사 대표 메일함으로 들어온 외부 메일)을 한 테이블에 둔다.
 *
 * 외부 메일 서버(SMTP/IMAP) 연동은 없다. 공용메일은 받은 메일을 사람이 등록해 두고,
 * 담당자를 배정해 처리 상태를 추적하는 용도다. 연동이 붙으면 등록 API 자리에 수신 훅이 들어온다.
 */
@Entity
@Table(name = "mails")
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)
@AllArgsConstructor
@Builder
public class Mail extends BaseTimeEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private MailType type;

    /** 사내메일은 보낸 사용자, 공용메일은 외부 발신자(로그인 사용자가 아니다) */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "sender_id")
    private User sender;

    /** 공용메일의 외부 발신 주소 */
    @Column(name = "from_address", length = 200)
    private String fromAddress;

    /** 사내메일 수신자. 공용메일은 특정 수신자가 없다(누구나 보고 담당자를 정한다). */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "recipient_id")
    private User recipient;

    @Column(nullable = false, length = 200)
    private String subject;

    @Column(columnDefinition = "text")
    private String body;

    @Column(name = "sent_at", nullable = false)
    private LocalDateTime sentAt;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    @Builder.Default
    private MailStatus status = MailStatus.UNREAD;

    /** 공용메일 처리 담당자 */
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "assignee_id")
    private User assignee;

    @Column(name = "handled_at")
    private LocalDateTime handledAt;

    /** 처리 결과 메모 */
    @Column(name = "handle_note", length = 500)
    private String handleNote;
}
