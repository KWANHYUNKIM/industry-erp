package com.erp.groupware.service;

import com.erp.common.ApiException;
import com.erp.groupware.domain.Mail;
import com.erp.auth.domain.User;
import com.erp.groupware.domain.enums.MailStatus;
import com.erp.groupware.domain.enums.MailType;
import com.erp.groupware.dto.MailDtos.AssignMailRequest;
import com.erp.groupware.dto.MailDtos.HandleMailRequest;
import com.erp.groupware.dto.MailDtos.MailResponse;
import com.erp.groupware.dto.MailDtos.ReceiveSharedMailRequest;
import com.erp.groupware.dto.MailDtos.SendMailRequest;
import com.erp.groupware.dto.MailDtos.SharedMailBox;
import com.erp.groupware.repository.MailRepository;
import com.erp.auth.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import com.erp.groupware.dto.MailDtos;

/**
 * 공용메일: 사내메일(사용자끼리) + 공용 메일함(외부 수신 메일에 담당자를 배정해 처리).
 *
 * 외부 메일 서버 연동은 없다. 공용메일은 받은 메일을 사람이 등록해 두고 처리를 추적한다.
 * 읽음 처리는 수신자 본인만, 처리 완료는 배정된 담당자만 할 수 있다 — 남의 메일을 대신
 * 읽음으로 바꾸면 "아무도 안 본 메일"이 조용히 사라진다.
 */
@Service
@RequiredArgsConstructor
public class MailService {

    private final MailRepository mailRepository;
    private final UserRepository userRepository;

    @Transactional(readOnly = true)
    public List<MailResponse> inbox(String username) {
        return mailRepository.findInbox(me(username).getId()).stream().map(MailResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public List<MailResponse> sent(String username) {
        return mailRepository.findSent(me(username).getId()).stream().map(MailResponse::from).toList();
    }

    @Transactional(readOnly = true)
    public SharedMailBox shared() {
        long pending = mailRepository.countByTypeAndStatusNot(MailType.SHARED, MailStatus.HANDLED);
        return new SharedMailBox(pending,
                mailRepository.findShared().stream().map(MailResponse::from).toList());
    }

    /** 사내메일 발송 */
    @Transactional
    public MailResponse send(SendMailRequest req, String username) {
        User sender = me(username);
        User recipient = userRepository.findById(req.recipientId())
                .orElseThrow(() -> ApiException.notFound("받는 사람을 찾을 수 없습니다. id=" + req.recipientId()));
        if (recipient.getId().equals(sender.getId())) {
            throw ApiException.badRequest("자기 자신에게는 보낼 수 없습니다.");
        }

        Mail m = Mail.builder()
                .type(MailType.INTERNAL)
                .sender(sender)
                .recipient(recipient)
                .subject(req.subject())
                .body(req.body())
                .sentAt(LocalDateTime.now())
                .status(MailStatus.UNREAD)
                .build();
        return MailResponse.from(mailRepository.save(m));
    }

    /** 공용메일 수신 등록 */
    @Transactional
    public MailResponse receiveShared(ReceiveSharedMailRequest req) {
        Mail m = Mail.builder()
                .type(MailType.SHARED)
                .fromAddress(req.fromAddress())
                .subject(req.subject())
                .body(req.body())
                .sentAt(req.receivedAt() != null ? req.receivedAt() : LocalDateTime.now())
                .status(MailStatus.UNREAD)
                .build();
        return MailResponse.from(mailRepository.save(m));
    }

    /** 읽음 처리. 사내메일은 수신자 본인만 읽음으로 바꿀 수 있다. */
    @Transactional
    public MailResponse markRead(Long id, String username) {
        Mail m = get(id);
        if (m.getType() == MailType.INTERNAL) {
            User user = me(username);
            if (m.getRecipient() == null || !m.getRecipient().getId().equals(user.getId())) {
                throw ApiException.badRequest("받는 사람만 읽음 처리할 수 있습니다.");
            }
        }
        if (m.getStatus() == MailStatus.UNREAD) {
            m.setStatus(MailStatus.READ);
        }
        return MailResponse.from(m);
    }

    /** 공용메일 담당자 배정 (공용메일 전용) */
    @Transactional
    public MailResponse assign(Long id, AssignMailRequest req) {
        Mail m = sharedMail(id, "담당자 배정");
        if (m.getStatus() == MailStatus.HANDLED) {
            throw ApiException.conflict("이미 처리완료된 메일입니다: " + m.getSubject());
        }
        User assignee = userRepository.findById(req.assigneeId())
                .orElseThrow(() -> ApiException.notFound("담당자를 찾을 수 없습니다. id=" + req.assigneeId()));

        m.setAssignee(assignee);
        m.setStatus(MailStatus.IN_PROGRESS);
        return MailResponse.from(m);
    }

    /** 공용메일 처리 완료. 배정된 담당자만 처리할 수 있다. */
    @Transactional
    public MailResponse handle(Long id, HandleMailRequest req, String username) {
        Mail m = sharedMail(id, "처리");
        if (m.getAssignee() == null) {
            throw ApiException.badRequest("담당자가 배정되지 않은 메일입니다. 먼저 담당자를 지정하세요.");
        }
        if (m.getStatus() == MailStatus.HANDLED) {
            throw ApiException.conflict("이미 처리완료된 메일입니다: " + m.getSubject());
        }
        User user = me(username);
        if (!m.getAssignee().getId().equals(user.getId())) {
            throw ApiException.badRequest("배정된 담당자(" + m.getAssignee().getName() + ")만 처리할 수 있습니다.");
        }

        m.setStatus(MailStatus.HANDLED);
        m.setHandledAt(LocalDateTime.now());
        m.setHandleNote(req != null ? req.note() : null);
        return MailResponse.from(m);
    }

    private Mail sharedMail(Long id, String action) {
        Mail m = get(id);
        if (m.getType() != MailType.SHARED) {
            throw ApiException.badRequest("공용메일만 " + action + "할 수 있습니다.");
        }
        return m;
    }

    private Mail get(Long id) {
        return mailRepository.findById(id)
                .orElseThrow(() -> ApiException.notFound("메일을 찾을 수 없습니다. id=" + id));
    }

    private User me(String username) {
        return userRepository.findByUsername(username)
                .orElseThrow(() -> ApiException.notFound("사용자를 찾을 수 없습니다: " + username));
    }
}
